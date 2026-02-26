import { useState, useEffect, useCallback, useRef } from 'react';
import { gwehaiClient, GwehAIEvent, GwehAIJobResponse } from '../utils/gwehaiApi';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

function getWsHost() {
  if (API_BASE.startsWith('http')) {
    const u = new URL(API_BASE);
    return `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`;
  }
  return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
}

export function useGwehai() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [events, setEvents] = useState<GwehAIEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const connectToJobStream = useCallback(
    (streamJobId: string, onDone?: () => void) => {
      const wsHost = getWsHost();
      const token = (() => {
        try {
          const user = localStorage.getItem('scout_user');
          return user ? JSON.parse(user).token : null;
        } catch {
          return null;
        }
      })();
      if (!token) {
        setError('Not authenticated. Please login again.');
        setStatus('failed');
        return;
      }
      const wsUrl = `${wsHost}/gwehai-jobs?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setStatus('running');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data?.type === 'event' && data.job_id === streamJobId && data.event) {
            const ev: GwehAIEvent = {
              type: data.event.type,
              data: data.event.data || {},
              timestamp: new Date().toISOString(),
            };
            setEvents((prev) => [...prev, ev]);

            if (ev.type === 'status') {
              setStatus(ev.data.message || ev.data.status || 'running');
            } else if (ev.type === 'reasoning') {
              setStatus(ev.data?.message || 'Reasoning...');
            } else if (ev.type === 'done') {
              setStatus('completed');
              if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
              }
              if (onDone) onDone();
            } else if (ev.type === 'error') {
              setError(ev.data.error || ev.data.message || 'An error occurred');
              setStatus('failed');
              if (socketRef.current) {
                socketRef.current.close();
                socketRef.current = null;
              }
            }
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        setError('Connection lost. Please try again.');
        setStatus('failed');
        if (onDone) onDone();
        socketRef.current = null;
      };
    },
    [],
  );

  /**
   * Start a chat/pentest
   */
  const startChat = useCallback(async (message: string, _conversationHistory?: Array<{ role: string; content: string }>) => {
    try {
      setStatus('starting');
      setError(null);
      setEvents([]);

      // Start chat and get job_id
      // Use stream: false to get clean JSON response with job_id
      const result: GwehAIJobResponse = await gwehaiClient.startScan(message, false);
      const newJobId = result.job_id;
      
      if (!newJobId) {
        throw new Error('No job_id returned from API');
      }
      setJobId(newJobId);
      setStatus('running');

      connectToJobStream(newJobId);

      return newJobId;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to start chat';
      setError(errorMessage);
      setStatus('failed');
      
      // Show user-friendly error
      if (errorMessage.includes('Cannot connect') || errorMessage.includes('Failed to fetch')) {
        setError('Cannot connect to server. Please check if the API is running.');
      } else if (errorMessage.includes('target URL') || errorMessage.includes('valid URL')) {
        setError('Please provide a valid URL for pentesting.');
      }
      
      throw err;
    }
  }, []);

  /**
   * Stop the current job
   */
  const stopJob = useCallback(async () => {
    if (!jobId) return;

    try {
      await gwehaiClient.stopJob(jobId);
      setStatus('stopped');
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    } catch (err: any) {
      setError(err.message || 'Failed to stop job');
    }
  }, [jobId]);

  /**
   * Continue the current job
   */
  const continueJob = useCallback(async () => {
    if (!jobId) return;

    try {
      await gwehaiClient.continueJob(jobId);
      setStatus('running');
      
      // Reconnect to events over WebSocket
      if (socketRef.current) {
        socketRef.current.close();
      }
      connectToJobStream(jobId);
    } catch (err: any) {
      setError(err.message || 'Failed to continue job');
    }
  }, [jobId]);

  /**
   * Get job status
   */
  const getJobStatus = useCallback(async () => {
    if (!jobId) return null;

    try {
      const status = await gwehaiClient.getJobStatus(jobId);
      setStatus(status.status || 'unknown');
      return status;
    } catch (err: any) {
      setError(err.message || 'Failed to get job status');
      return null;
    }
  }, [jobId]);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setJobId(null);
    setStatus('idle');
    setEvents([]);
    setError(null);
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  return {
    jobId,
    status,
    events,
    error,
    startChat,
    stopJob,
    continueJob,
    getJobStatus,
    reset,
  };
}
