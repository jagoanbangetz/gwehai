/**
 * GwehAI API client for SSE streaming.
 * Uses the app backend (relative /api by default); no external GwehAI service.
 * VITE_API_URL can override base (e.g. /api or full backend URL for production).
 */

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
const GWEHAI_API_BASE = `${API_BASE}/gwehai`;

const TOOL_USE_FAILED_MESSAGE =
  'The model returned an invalid response. Try again or use a different model (e.g. DeepSeek or Claude) for this task.';

/** Normalize error event payload so we never show raw Groq/API JSON to the user. */
function normalizeSseErrorMessage(eventData: unknown): string {
  if (eventData == null) return 'An error occurred. Please try again.';
  if (typeof eventData === 'string') {
    const s = eventData.trim();
    if (!s) return TOOL_USE_FAILED_MESSAGE;
    if (/failed to call a function|tool_use_failed|failed_generation/i.test(s)) return TOOL_USE_FAILED_MESSAGE;
    try {
      const j = JSON.parse(s);
      const msg = j?.error?.message ?? j?.message;
      if (typeof msg === 'string' && /failed to call a function|tool_use_failed/i.test(msg)) return TOOL_USE_FAILED_MESSAGE;
      return typeof msg === 'string' ? msg : s;
    } catch {
      return s.slice(0, 500);
    }
  }
  if (typeof eventData === 'object' && eventData !== null) {
    const o = eventData as Record<string, unknown>;
    const msg = (o.message as string) ?? (o.error as Record<string, unknown>)?.message;
    if (typeof msg === 'string') {
      if (/failed to call a function|tool_use_failed|failed_generation/i.test(msg)) return TOOL_USE_FAILED_MESSAGE;
      return msg;
    }
    const err = o.error;
    if (err && typeof err === 'object' && typeof (err as Record<string, unknown>).message === 'string') {
      const m = (err as Record<string, unknown>).message as string;
      if (/failed to call a function|tool_use_failed/i.test(m)) return TOOL_USE_FAILED_MESSAGE;
      return m;
    }
  }
  return TOOL_USE_FAILED_MESSAGE;
}

export interface GwehAIEvent {
  type: string;
  data: {
    message?: string;
    tool?: string;
    args?: object;
    result?: string;
    chunk?: string;
    status?: string;
    error?: string;
    report_path?: string;
    [key: string]: any;
  };
  timestamp?: string;
}

export interface GwehAIJobResponse {
  job_id: string; // In new API this maps to stream_id
  status: string;
  message?: string;
  events_url?: string;
  status_url?: string;
  conversation_id?: string;
}

export class GwehAIClient {
  private baseUrl: string;

  constructor(baseUrl: string = GWEHAI_API_BASE) {
    this.baseUrl = baseUrl;
  }

  /**
   * List available model options for the Model Provider selector.
   * GET /api/gwehai/models → { options: [{ key, label, provider, defaultModel, apiKeyEnv }] }
   */
  async getModels(): Promise<
    Array<{ key: 'auto' | 'deepseek' | 'openai_gpt5' | 'claude' | 'gemini'; label: string; provider: string }>
  > {
    const user = localStorage.getItem('scout_user');
    const token = user ? JSON.parse(user).token : null;

    const response = await fetch(`${this.baseUrl}/models`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });

    if (!response.ok) {
      // Do not throw here; let caller fall back to built-in options
      throw new Error('Failed to load model options');
    }

    const data = await response.json();
    const options = Array.isArray(data?.options) ? data.options : [];
    return options.map((opt: any) => ({
      key: opt.key as 'auto' | 'deepseek' | 'openai_gpt5' | 'claude' | 'gemini',
      label: typeof opt.label === 'string' ? opt.label : String(opt.key ?? ''),
      provider: typeof opt.provider === 'string' ? opt.provider : '',
    }));
  }

  /**
   * Start a scan - SIMPLIFIED: Only message and stream required!
   * All other parameters (target_url, instruction, etc.) are auto-extracted.
   * 
   * Flow: Frontend → API → Frontend
   * 1. Send request → Get job_id immediately
   * 2. Connect to SSE → Get real-time updates
   */
  /**
   * Start a chat: creates a job and returns job_id. Use that job_id to open the stream.
   * Flow: 1) POST /api/gwehai/chat → { job_id, conversation_id }. 2) Connect to stream with that job_id.
   * Each conversation has many job_ids (one per message).
   */
  async startScan(
    message: string,
    stream: boolean = true,
    jobId?: string,
    modelKey?: 'auto' | 'deepseek_v4' | 'deepseek_v4_pro' | 'openai_gpt5' | 'openai_o' | 'claude' | 'gemini' | 'xai' | 'meta' | 'deepseek_reasoner',
    mode?: 'agent' | 'ask',
    modelId?: string,
    maxAgents?: number,
    signal?: AbortSignal
  ): Promise<GwehAIJobResponse> {
    const user = localStorage.getItem('scout_user');
    const token = user ? JSON.parse(user).token : null;

    const response = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: message }],
        stream: stream,
        ...(jobId && { conversation_id: jobId }), // Use conversation_id for continuation
        model_key: modelKey ?? 'auto', // Auto = DeepSeek; always send so backend never returns "Model not found"
        ...(mode && { mode }), // 'ask' = force simple Q&A only; 'agent' = use heuristic
        ...(modelId && { model_id: modelId }), // Optional: specific model from DB (e.g. GPT-5.4, Gemini 2.5 Flash)
        ...(maxAgents != null && maxAgents >= 1 && maxAgents <= 20 && { max_agents: maxAgents }),
      }),
      signal,
    });

    if (!response.ok) {
      let errorMessage = 'Failed to start scan';
      try {
        const error = await response.json();
        // Handle different error formats
        if (error.detail) {
          errorMessage = error.detail;
        } else if (error.message) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        }
      } catch (e) {
        // If JSON parsing fails, try to get text
        try {
          const text = await response.text();
          if (text) errorMessage = text;
        } catch (e2) {
          // Use default error message
        }
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const streamJobId = data.job_id ?? data.stream_id ?? data.id;
    if (!streamJobId) {
      throw new Error('No job_id returned from chat API');
    }
    return {
      job_id: streamJobId,
      status: data.status || 'pending',
      message: data.message,
      events_url: `/chat/stream?stream_id=${encodeURIComponent(streamJobId)}`,
      status_url: data.status_url || '',
      conversation_id: data.conversation_id,
    };
  }

  /**
   * Send message with full conversation history using new-style API
   * POST /api/gwehai/chat
   */
  async sendMessage(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    stream: boolean = true,
    jobId?: string
  ): Promise<GwehAIJobResponse> {
    // Get auth token from localStorage
    const user = localStorage.getItem('scout_user');
    const token = user ? JSON.parse(user).token : null;

    const response = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({
        messages,
        stream,
        ...(jobId && { conversation_id: jobId }), // Use conversation_id for continuation
      }),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to send message';
      try {
        const error = await response.json();
        // Handle different error formats
        if (error.detail) {
          errorMessage = Array.isArray(error.detail) 
            ? error.detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join(', ')
            : error.detail;
        } else if (error.message) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        }
      } catch (e) {
        // If JSON parsing fails, try to get text
        try {
          const text = await response.text();
          if (text) errorMessage = text;
        } catch (e2) {
          // Use default error message
        }
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const streamJobId = data.job_id ?? data.stream_id ?? data.id;
    if (!streamJobId) {
      throw new Error('No job_id returned from chat API');
    }
    return {
      job_id: streamJobId,
      status: data.status || 'pending',
      message: data.message,
      events_url: `/chat/stream?stream_id=${encodeURIComponent(streamJobId)}`,
      status_url: data.status_url || '',
      conversation_id: data.conversation_id,
    };
  }

  /**
   * Connect to stream using the job_id from the chat response.
   * GET /api/gwehai/chat/stream?stream_id=<job_id>
   */
  connectToEvents(
    jobId: string,
    onEvent: (event: GwehAIEvent) => void,
    onError?: (error: Event) => void,
    onOpen?: () => void
  ): EventSource {
    const url = `${this.baseUrl}/chat/stream?stream_id=${encodeURIComponent(jobId)}`;
    
    console.log('[GwehAI Client] Connecting to SSE (new API), URL:', url);
    
    const es = new EventSource(url);
    let reconnectCount = 0;
    const maxReconnects = 20;
    let lastErrorTime = 0;
    const errorThrottle = 2000; // Only log errors every 2 seconds

    es.onopen = () => {
      console.log('[GwehAI Client] SSE connection opened successfully for job:', jobId);
      reconnectCount = 0; // Reset reconnect count on successful connection
      if (onOpen) onOpen();
    };

    // Handle default message events (fallback for events without a type)
    es.onmessage = (e) => {
      try {
        console.log('[GwehAI Client] Received SSE message (no type):', 'Data length:', e.data?.length || 0);
        // Try to parse as JSON, if it fails, treat as plain text
        let data;
        try {
          data = JSON.parse(e.data);
          // If parsed successfully and has a type, use it
          if (data.type) {
            onEvent(data);
          } else {
            // Otherwise, wrap it
            onEvent({ type: 'message', data });
          }
        } catch {
          // Not JSON, treat as plain text content
          onEvent({ type: 'content', data: { chunk: e.data } });
        }
      } catch (error) {
        console.error('[GwehAI Client] Failed to handle SSE message:', error);
      }
    };

    // Handle all SSE event types from GwehAI API
    // Based on test output, GwehAI sends: status, content, content_done, done, connected, thinking, tool, result, error
    
    const handleTypedEvent = (eventType: string) => {
      es.addEventListener(eventType, (e: any) => {
        try {
          // EventSource also emits transport-level "error" events without payload.
          // Do not forward those as chat errors; let es.onerror handle reconnect logic.
          if (eventType === 'error' && (!e?.data || !String(e.data).trim())) {
            return;
          }

          let eventData: any;
          // Try to parse as JSON
          if (e.data && e.data.trim()) {
            try {
              eventData = JSON.parse(e.data);
            } catch {
              // Not JSON, treat as plain string
              eventData = e.data;
            }
          }
          
          // Log each event to console so user can see stream activity
          if (eventType === 'connected') {
            console.log('[GwehAI] SSE event: connected', eventData?.stream_id ? { stream_id: eventData.stream_id } : eventData);
          } else if (eventType === 'status') {
            console.log('[GwehAI] SSE event: status', eventData?.message ?? eventData);
          } else if (eventType === 'reasoning') {
            console.log('[GwehAI] SSE event: reasoning', eventData?.message ?? eventData);
          } else if (eventType === 'tool_start') {
            console.log('[GwehAI] SSE event: tool_start', eventData?.name ?? eventData?.tool, eventData?.input ?? '');
          } else if (eventType === 'tool_log') {
            const text = eventData?.text ?? eventData?.log ?? '';
            console.log('[GwehAI] SSE event: tool_log', text.length > 120 ? text.slice(0, 120) + '...' : text);
          } else if (eventType === 'tool_end') {
            console.log('[GwehAI] SSE event: tool_end', eventData?.status ?? 'ok', eventData?.tool_call_id ?? '');
          } else if (eventType === 'done') {
            console.log('[GwehAI] SSE event: done', eventData?.job_id ?? eventData);
          } else if (eventType === 'error') {
            const errMsg = normalizeSseErrorMessage(eventData);
            console.log('[GwehAI] SSE event: error', errMsg);
          } else {
            console.log('[GwehAI] SSE event:', eventType, eventData);
          }

          // Transform the event to match our expected format
          if (eventType === 'status') {
            // status event: data is JSON like {"message": "Planning the plan..."} or {"message": "Executing the plan..."}
            onEvent({ 
              type: 'status', 
              data: typeof eventData === 'object' ? eventData : { message: eventData } 
            });
          } else if (eventType === 'reasoning') {
            // reasoning event: what the agent is about to do (e.g. "Running: memory_search", "Running: curl ...")
            onEvent({ 
              type: 'reasoning', 
              data: typeof eventData === 'object' ? eventData : { message: eventData } 
            });
          } else if (eventType === 'reasoning_block') {
            // reasoning_block: full thinking (<think> content) — shown in UI above final reply
            onEvent({ 
              type: 'reasoning_block', 
              data: typeof eventData === 'object' ? eventData : { message: eventData } 
            });
          } else if (eventType === 'message_delta') {
            // message_delta event: data is JSON like {"message_id": "...", "delta": "..."}
            const delta = eventData.delta || eventData.chunk || eventData.content || '';
            onEvent({ 
              type: 'message_delta', 
              data: { 
                message_id: eventData.message_id, 
                delta: String(delta)
              } 
            });
          } else if (eventType === 'content') {
            // content event: data is a string chunk
            // Extract chunk from various possible formats
            let chunk = '';
            if (typeof eventData === 'string') {
              chunk = eventData;
            } else if (eventData && typeof eventData === 'object') {
              // If it's an object, try to extract chunk property
              chunk = eventData.chunk || eventData.delta || eventData.content || eventData.text || '';
              // If still no chunk, stringify only if it's a simple value
              if (!chunk && (eventData.value || eventData.data)) {
                chunk = String(eventData.value || eventData.data || '');
              }
            } else {
              chunk = String(eventData || '');
            }
            
            // Clean the chunk - remove any JSON artifacts or escape sequences
            // First, check if the chunk is a JSON string that needs parsing
            if (chunk.startsWith('{') && chunk.includes('"chunk"')) {
              try {
                const parsed = JSON.parse(chunk);
                if (parsed && typeof parsed === 'object') {
                  if (parsed.data && parsed.data.chunk) {
                    chunk = parsed.data.chunk;
                  } else if (parsed.chunk) {
                    chunk = parsed.chunk;
                  } else if (parsed.content) {
                    chunk = parsed.content;
                  }
                }
              } catch {
                // If parsing fails, continue with cleaning
              }
            }
            
            // Clean the chunk - remove any remaining JSON artifacts or escape sequences
            chunk = chunk
              .replace(/\{"type":"content","data":\{"chunk":"([^"]+)"\}[^}]*\}/g, '$1') // Remove full JSON structure
              .replace(/\{"chunk":"([^"]+)"\}/g, '$1') // Remove chunk JSON wrapper
              .replace(/^["']|["']$/g, '') // Remove surrounding quotes
              .replace(/\\n/g, '\n') // Unescape newlines
              .replace(/\\t/g, '\t') // Unescape tabs
              .replace(/\\"/g, '"') // Unescape quotes
              .replace(/\\'/g, "'") // Unescape single quotes
              .replace(/\\\\/g, '\\'); // Unescape backslashes
            
            onEvent({ 
              type: 'content', 
              data: { chunk } 
            });
          } else if (eventType === 'content_done' || eventType === 'message_done') {
            // content_done event: data is JSON with full content
            onEvent({ 
              type: 'content_done', 
              data: typeof eventData === 'object' ? eventData : { content: eventData } 
            });
          } else if (eventType === 'done') {
            // done event: data is JSON like {"job_id": "..."}
            onEvent({ 
              type: 'done', 
              data: typeof eventData === 'object' ? eventData : { job_id: eventData } 
            });
          } else if (eventType === 'tool_start') {
            // tool_start event: data is JSON like {"tool_call_id": "...", "name": "...", "input": {...}}
            onEvent({ 
              type: 'tool_start', 
              data: eventData
            });
          } else if (eventType === 'tool_log') {
            // tool_log event: data is JSON like {"tool_call_id": "...", "text": "..."}
            onEvent({ 
              type: 'tool_log', 
              data: eventData
            });
          } else if (eventType === 'tool_end') {
            // tool_end event: data is JSON like {"tool_call_id": "...", "status": "ok", "output": {...}}
            onEvent({ 
              type: 'tool_end', 
              data: eventData
            });
          } else if (eventType === 'error') {
            // Normalize so UI never shows raw Groq/API error object; omit undefined fields
            const message = normalizeSseErrorMessage(eventData);
            const data: Record<string, unknown> = { message };
            if (eventData && typeof eventData === 'object') {
              if (eventData.agent_index != null) data.agent_index = eventData.agent_index;
              if (eventData.agent_label != null) data.agent_label = eventData.agent_label;
              if (eventData.error_code != null) data.error_code = eventData.error_code;
            }
            onEvent({ type: 'error', data });
          } else {
            // Other event types (thinking, tool, result, connected, message_id)
            onEvent({ 
              type: eventType, 
              data: typeof eventData === 'object' ? eventData : { message: eventData } 
            });
          }
        } catch (error) {
          console.error(`[GwehAI Client] Failed to handle ${eventType} event:`, error);
        }
      });
    };

    // Register listeners for all SSE event types from GwehAI API spec
    [
      'connected',        // Stream connection established
      'state_sync',       // State replay on fresh reconnect (current step, status)
      'message_delta',    // Assistant text streaming (one chunk at a time)
      'message_done',     // Assistant message finished
      'simple_response', // Structured reply/details/followUps for simple conversation
      'reasoning',        // What the agent is about to do (e.g. "Running: memory_search", "Running: curl ...")
      'reasoning_block',  // Full thinking (<think> block) — shown in UI above final reply
      'tool_start',       // Tool run started
      'tool_log',         // Tool output line (streamed for background tools)
      'tool_end',         // Tool run finished
      'status',           // Status message (e.g. "Planning the plan...", "Running tools...")
      'error',            // Error from stream
      'done',             // Stream finished
      // Legacy/fallback events (for backward compatibility)
      'content',
      'content_done',
      'thinking',
      'tool',
      'result',
      'message_id',
    ].forEach(handleTypedEvent);

    es.onerror = (error: any) => {
      const now = Date.now();
      const readyState = es.readyState;

      // Check if it's a 401 error (unauthorized) - token might be expired
      if (readyState === EventSource.CLOSED) {
        // Try to check if it's an auth error by checking the response
        // EventSource doesn't give us status codes directly, but we can infer from behavior
        reconnectCount++;
        lastErrorTime = now;

        // If we get closed immediately, it might be an auth error
        if (reconnectCount === 1) {
          // Check if token might be expired
          const user = localStorage.getItem('scout_user');
          if (user) {
            try {
              const userData = JSON.parse(user);
              if (userData.token) {
                // Decode JWT to check expiration (simple check without verification)
                const payload = JSON.parse(atob(userData.token.split('.')[1]));
                const exp = payload.exp * 1000; // Convert to milliseconds
                if (exp < Date.now()) {
                  console.warn('Token expired. Please login again.');
                  // Clear expired token
                  localStorage.removeItem('scout_user');
                  // Redirect to login
                  window.location.href = '/login?error=token_expired';
                  es.close();
                  if (onError) onError(error);
                  return;
                }
              }
            } catch (e) {
              // Token parsing failed, might be invalid
            }
          }
        }
      }

      // Throttle error logging to avoid spam
      if (now - lastErrorTime < errorThrottle && readyState !== EventSource.CLOSED) {
        return; // Skip logging if we just logged an error recently
      }

      if (readyState === EventSource.CLOSED) {
        // Connection is closed - check if we should stop trying
        if (reconnectCount >= maxReconnects) {
          console.warn(`SSE connection closed after ${maxReconnects} reconnection attempts for job:`, jobId);
          if (onError) onError(error);
          es.close(); // Stop trying to reconnect
        } else {
          // Connection closed but will try to reconnect (EventSource default behavior)
          // Don't log this as it's expected behavior
        }
      } else if (readyState === EventSource.CONNECTING) {
        // Connection is reconnecting - normal EventSource behavior, do not count as a hard failure.
      } else if (readyState === EventSource.OPEN) {
        // Connection is open but error occurred - might be a network issue
        // Don't log unless it's a persistent issue
      }
    };

    return es;
  }

  /**
   * List current user's jobs (running first, then recent). Used by Current Pentest modal to show all jobs.
   */
  async getJobs(): Promise<Array<{ job_id: string; status: string; user_message: string; conversation_id?: string; createdAt: number }>> {
    const user = localStorage.getItem('scout_user');
    const token = user ? JSON.parse(user).token : null;

    const response = await fetch(`${this.baseUrl}/jobs`, {
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
    if (!response.ok) {
      throw new Error('Failed to list jobs');
    }
    return response.json();
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<any> {
    const user = localStorage.getItem('scout_user');
    const token = user ? JSON.parse(user).token : null;

    const response = await fetch(`${this.baseUrl}/job/${jobId}`, {
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
    if (!response.ok) {
      throw new Error('Failed to get job status');
    }
    return response.json();
  }

  /**
   * Stop a running job
   */
  async stopJob(jobId: string): Promise<any> {
    const user = localStorage.getItem('scout_user');
    const token = user ? JSON.parse(user).token : null;

    const response = await fetch(`${this.baseUrl}/job/${jobId}/stop`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
    if (!response.ok) {
      throw new Error('Failed to stop job');
    }
    return response.json();
  }

  /**
   * Continue/Resume a job
   */
  async continueJob(jobId: string): Promise<any> {
    const user = localStorage.getItem('scout_user');
    const token = user ? JSON.parse(user).token : null;

    const response = await fetch(`${this.baseUrl}/job/${jobId}/continue`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
    if (!response.ok) {
      throw new Error('Failed to continue job');
    }
    return response.json();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const user = localStorage.getItem('scout_user');
      const token = user ? JSON.parse(user).token : null;

      const response = await fetch(`${this.baseUrl}/health`, {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const gwehaiClient = new GwehAIClient();
