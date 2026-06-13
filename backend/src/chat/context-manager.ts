/**
 * Context Window Manager
 * 
 * Handles message truncation, context size estimation, and compaction
 * to stay within LLM context window limits. Extracted from ChatService
 * for single-responsibility and reusability.
 */

import type { LlmMessage } from '../llm/llm.types';

/** Message-count guard for context window. Keeps system + first user + last N. */
export const MAX_MESSAGES_FOR_CONTEXT = 40;
/** Global content-size guard (character based) before each LLM call. */
export const MAX_CONTEXT_TOTAL_CHARS = 120_000;
/** Per-message caps so huge tool outputs do not bloat context. */
export const MAX_CONTEXT_CHARS_PER_ROLE = {
  system: 16_000,
  user: 10_000,
  assistant: 7_000,
  tool: 3_500,
  default: 6_000,
} as const;

export function clipTextPreserveHeadTail(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;
  if (maxChars <= 200) return text.slice(0, maxChars);
  const head = Math.floor(maxChars * 0.65);
  const tail = Math.max(80, maxChars - head - 80);
  return `${text.slice(0, head)}\n\n...[truncated for context]...\n\n${text.slice(-tail)}`;
}

function maxCharsForRole(role?: string): number {
  switch (role) {
    case 'system':
      return MAX_CONTEXT_CHARS_PER_ROLE.system;
    case 'user':
      return MAX_CONTEXT_CHARS_PER_ROLE.user;
    case 'assistant':
      return MAX_CONTEXT_CHARS_PER_ROLE.assistant;
    case 'tool':
      return MAX_CONTEXT_CHARS_PER_ROLE.tool;
    default:
      return MAX_CONTEXT_CHARS_PER_ROLE.default;
  }
}

function compactMessageForContext(msg: LlmMessage): LlmMessage {
  const content = typeof msg.content === 'string' ? msg.content : '';
  if (!content) return msg;
  const maxChars = maxCharsForRole(msg.role);
  if (content.length <= maxChars) return msg;
  return {
    ...msg,
    content: clipTextPreserveHeadTail(content, maxChars),
  };
}

function estimateChars(messages: LlmMessage[]): number {
  return messages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0);
}

/**
 * Normalize tool message order and fix tool_calls protocol violations.
 * 
 * Two passes:
 * 1. Forward pass: track tool_call IDs from assistant messages, drop orphan tool messages
 * 2. Backward pass: detect assistant messages with unpaired tool_calls and either
 *    strip the tool_calls (fallback to text-only) or remove the message entirely
 * 
 * This prevents the LLM API error:
 * "An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'"
 */
function normalizeToolMessageOrder(messages: LlmMessage[]): LlmMessage[] {
  // ── Pass 1: Forward — drop orphan tool messages ──────────────────────
  const out: LlmMessage[] = [];
  const openToolCallIds = new Set<string>();

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      out.push(msg);
      for (const tc of msg.tool_calls ?? []) {
        if (tc?.id) openToolCallIds.add(tc.id);
      }
      continue;
    }

    if (msg.role === 'tool') {
      const tcid = String(msg.tool_call_id ?? '').trim();
      if (!tcid || !openToolCallIds.has(tcid)) {
        // Drop dangling/orphan tool message caused by context truncation.
        console.log(`[ContextManager] Dropping orphan tool message (tool_call_id=${tcid || 'empty'})`);
        continue;
      }
      out.push(msg);
      openToolCallIds.delete(tcid);
      continue;
    }

    out.push(msg);
  }

  // ── Pass 2: Backward — fix assistant messages with unpaired tool_calls ─
  // After Pass 1, `openToolCallIds` contains IDs from assistant messages whose
  // tool responses were NOT found (dropped or never existed).
  // We must remove these tool_calls from the assistant messages to prevent
  // the "tool_calls must be followed by tool messages" API error.
  if (openToolCallIds.size > 0) {
    console.log(`[ContextManager] Found ${openToolCallIds.size} unpaired tool_call IDs: [${Array.from(openToolCallIds).join(', ')}]`);
    
    const fixed: LlmMessage[] = [];
    for (const msg of out) {
      if (msg.role === 'assistant' && msg.tool_calls?.length) {
        // Filter out unpaired tool_calls
        const paired = msg.tool_calls.filter((tc) => !openToolCallIds.has(tc.id));
        
        if (paired.length === 0) {
          // All tool_calls are unpaired — strip tool_calls entirely, keep as text-only
          const { tool_calls, ...textOnly } = msg;
          if (textOnly.content?.trim()) {
            console.log(`[ContextManager] Stripped all tool_calls from assistant message (kept text content)`);
            fixed.push(textOnly as LlmMessage);
          } else {
            // No text content either — drop the message entirely
            console.log(`[ContextManager] Dropped empty assistant message with only unpaired tool_calls`);
          }
        } else if (paired.length < msg.tool_calls.length) {
          // Some tool_calls are unpaired — keep only paired ones
          console.log(`[ContextManager] Stripped ${msg.tool_calls.length - paired.length} unpaired tool_calls from assistant message`);
          fixed.push({ ...msg, tool_calls: paired });
        } else {
          fixed.push(msg);
        }
      } else {
        fixed.push(msg);
      }
    }
    return fixed;
  }

  return out;
}

/**
 * Truncate messages to fit within context window limits.
 * Preserves system prompt and first user message as anchors.
 * Applies per-message clipping, then global budget dropping, then hard clipping.
 */
export function truncateMessagesForContext(messages: LlmMessage[], max = MAX_MESSAGES_FOR_CONTEXT): LlmMessage[] {
  const kept = messages.length <= max
    ? messages
    : (() => {
        const system = messages[0]?.role === 'system' ? [messages[0]] : [];
        const firstUser = messages[1]?.role === 'user' ? [messages[1]] : [];
        const rest = messages.slice(system.length + firstUser.length);
        const tail = rest.slice(-(max - system.length - firstUser.length));
        return [...system, ...firstUser, ...tail];
      })();

  // First pass: per-message clipping (especially tool outputs).
  let compacted = kept.map(compactMessageForContext);

  // Second pass: global budget guard; drop oldest non-anchor messages if still too large.
  while (estimateChars(compacted) > MAX_CONTEXT_TOTAL_CHARS && compacted.length > 3) {
    const anchorOffset = compacted[0]?.role === 'system' ? 1 : 0;
    const firstUserOffset = compacted[anchorOffset]?.role === 'user' ? 1 : 0;
    const dropIndex = anchorOffset + firstUserOffset; // oldest non-anchor
    compacted = compacted.filter((_, idx) => idx !== dropIndex);
  }

  // Final pass: harder clipping if still above budget.
  if (estimateChars(compacted) > MAX_CONTEXT_TOTAL_CHARS) {
    compacted = compacted.map((m, idx) => {
      const isSystem = idx === 0 && m.role === 'system';
      const isFirstUser = (idx === 1 && compacted[0]?.role === 'system' && m.role === 'user') || (idx === 0 && m.role === 'user');
      const hardLimit = isSystem ? 8_000 : isFirstUser ? 6_000 : (m.role === 'tool' ? 1_500 : 2_500);
      const content = typeof m.content === 'string' ? m.content : '';
      if (!content || content.length <= hardLimit) return m;
      return { ...m, content: clipTextPreserveHeadTail(content, hardLimit) };
    });
  }

  return normalizeToolMessageOrder(compacted);
}
