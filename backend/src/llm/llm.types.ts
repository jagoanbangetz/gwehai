export type LlmRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LlmMessage {
  role: LlmRole;
  content: string;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmResponse {
  content: string;
  usage?: LlmUsage;
  tool_calls?: LlmToolCall[];
}

export interface LlmToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: { type: string; properties?: Record<string, unknown>; required?: string[] };
  };
}
