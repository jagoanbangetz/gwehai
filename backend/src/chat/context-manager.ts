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

function normalizeToolMessageOrder(messages: LlmMessage[]): LlmMessage[] {
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
        continue;
      }
      out.push(msg);
      openToolCallIds.delete(tcid);
      continue;
    }

    out.push(msg);
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
