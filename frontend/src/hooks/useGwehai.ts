import { useState, useEffect, useCallback, useRef } from 'react';
import { gwehaiClient, GwehAIEvent, GwehAIJobResponse } from '../utils/gwehaiApi';

export function useGwehai() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [events, setEvents] = useState<GwehAIEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

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

      // Connect to events
      const es = gwehaiClient.connectToEvents(
        newJobId,
        (event: GwehAIEvent) => {
          setEvents((prev) => [...prev, event]);
          
          // Update status based on event
          if (event.type === 'status') {
            setStatus(event.data.message || event.data.status || 'running');
          } else if (event.type === 'reasoning') {
            setStatus(event.data?.message || 'Reasoning...');
          } else if (event.type === 'done') {
            setStatus('completed');
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
            }
          } else if (event.type === 'error') {
            setError(event.data.error || event.data.message || 'An error occurred');
            setStatus('failed');
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
            }
          }
        },
        (error) => {
          console.error('SSE connection error:', error);
          setError('Connection lost. Please try again.');
          setStatus('failed');
        },
        () => {
          console.log('SSE connection opened');
        }
      );

      eventSourceRef.current = es;

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
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
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
      
      // Reconnect to events
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = gwehaiClient.connectToEvents(
        jobId,
        (event: GwehAIEvent) => {
          setEvents((prev) => [...prev, event]);
          
          if (event.type === 'status') {
            setStatus(event.data.message || event.data.status || 'running');
          } else if (event.type === 'reasoning') {
            setStatus(event.data?.message || 'Reasoning...');
          } else if (event.type === 'done') {
            setStatus('completed');
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
            }
          }
        },
        (error) => {
          console.error('SSE connection error:', error);
          setError('Connection lost. Please try again.');
        },
        () => {
          console.log('SSE connection reopened');
        }
      );

      eventSourceRef.current = es;
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
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
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
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
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
