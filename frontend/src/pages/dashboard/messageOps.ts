import type { Message, Tool, ToolState } from './types'
import type { ModelKey } from '../../components/ModelPicker'

/**
 * Message and tool operation helpers extracted from Dashboard.
 * These are pure helper factories — they create message/tool objects
 * and return state-update functions. All state management (setState)
 * is handled by the caller (the Dashboard component).
 */

// ─── Message ID ───

export const createMessageId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

// ─── Message factories ───

export function makeAssistantMessage(
  eventType?: Message['eventType'],
  modelKey?: ModelKey,
): Message {
  return {
    id: createMessageId(),
    role: 'assistant',
    content: '',
    timestamp: new Date(),
    isStreaming: true,
    done: false,
    eventType: eventType || 'planning',
    ...(modelKey && { modelKey }),
  }
}

export function makeUserMessage(content: string): Message {
  return {
    id: createMessageId(),
    role: 'user',
    content,
    timestamp: new Date(),
    done: true,
  }
}

export function makeErrorMessage(content: string): Message {
  return {
    id: createMessageId(),
    role: 'assistant',
    content,
    timestamp: new Date(),
    eventType: 'error',
  }
}

// ─── Message state updaters (return prev => next for setMessages) ───

export function updateContent(messageId: string, delta: string) {
  if (!delta) return (prev: Message[]) => prev
  return (prev: Message[]) =>
    prev.map((m) =>
      m.id === messageId
        ? {
            ...m,
            content: (m.content || '') + delta,
            contentDisplay: m.contentDisplay !== undefined ? m.contentDisplay : '',
            isStreaming: true,
            done: false,
            eventType: 'content',
          }
        : m,
    )
}

export function markDone(messageId: string) {
  return (prev: Message[]) =>
    prev.map((m) =>
      m.id === messageId
        ? { ...m, isStreaming: false, done: true, contentDisplay: m.content }
        : m,
    )
}

// ─── Tool factories ───

export function makeTool(
  toolCallId: string,
  name: string,
  input: any,
  messageId: string,
  reasoning?: string,
): Tool {
  return {
    id: toolCallId,
    name: name || 'tool',
    input,
    logs: [],
    status: 'running',
    messageId,
    reasoning,
  }
}

// ─── Tool state updaters ───

export function initialToolState(): ToolState {
  return { activeTools: 0, hasTools: false, toolsComplete: false }
}

export function startToolState(prev: ToolState | undefined): ToolState {
  return {
    activeTools: (prev?.activeTools || 0) + 1,
    hasTools: true,
    toolsComplete: false,
  }
}

export function endToolState(prev: ToolState | undefined): ToolState {
  if (!prev) return prev!
  const activeTools = Math.max(0, prev.activeTools - 1)
  return {
    ...prev,
    activeTools,
    toolsComplete: activeTools === 0 && prev.hasTools,
  }
}

// ─── Stream chunk cleaning ───

const INVALID_CONTENT = new Set(['undefined', 'null', '0', 'false', ''])

/**
 * Clean raw SSE content chunks — strip JSON wrappers, unescape, filter invalid.
 */
export function cleanStreamChunk(raw: any): string {
  let chunk = raw
  if (typeof chunk !== 'string') {
    if (chunk && typeof chunk === 'object') {
      chunk = chunk.chunk || chunk.content || chunk.text || chunk.data?.chunk || chunk.data?.content || ''
    } else {
      chunk = String(chunk || '')
    }
  }

  let clean = String(chunk)
    .replace(/\{"type":"content","data":\{"chunk":"([^"]+)"\}[^}]*\}/g, '$1')
    .replace(/\{"type":"content","data":\{"chunk":"([^"]*)"\}[^}]*\}/g, '$1')
    .replace(/\{"chunk":"([^"]+)"\}/g, '$1')
    .replace(/\{"chunk":"([^"]*)"\}/g, '$1')
    .replace(/^\{.*?"chunk"\s*:\s*"([^"]+)".*\}$/g, '$1')
    .replace(/^\{.*?"chunk"\s*:\s*"([^"]*)".*\}$/g, '$1')
    .replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\')
    .replace(/^\{"type":.*?\}$/g, '')

  if (clean.startsWith('{') && clean.includes('"chunk"')) {
    try {
      const parsed = JSON.parse(clean)
      if (parsed?.data?.chunk) {
        clean = String(parsed.data.chunk || '')
      } else if (parsed?.chunk) {
        clean = String(parsed.chunk || '')
      }
    } catch {
      // keep cleaned text
    }
  }

  clean = String(clean || '')

  // Strip <think>...</think> blocks — these are internal reasoning, not for display.
  clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, '')

  if (INVALID_CONTENT.has(clean) || clean.trim().length === 0) {
    return ''
  }
  return clean
}
