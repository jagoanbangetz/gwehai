/** Utility functions and constants for the Dashboard module. */

import { formatDateTime } from '../../utils/date'
import type { ReportGroupRow, HacktivityRow, HacktivityConversationRow, Message, ChatHistory } from './types'

/** Derive YYYY-MM-DD from ISO string when date is missing. */
export function dateFromIso(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch {
    return '—'
  }
}

/** Normalize API report row to ReportGroupRow (accepts camelCase or snake_case from backend). */
export function normalizeReportGroupRow(raw: Record<string, unknown>): ReportGroupRow {
  let domain = String(raw.domain ?? '').trim() || '—'
  let date = String(raw.date ?? '').trim() || '—'
  const conversationId = raw.conversationId != null ? String(raw.conversationId).trim() || null : (raw.conversation_id != null ? String(raw.conversation_id).trim() || null : null)
  const findingsCount = Number(raw.findingsCount ?? raw.findings_count ?? 0)
  const createdAt = String(raw.createdAt ?? raw.created_at ?? '')
  const firstAt = String(raw.firstAt ?? raw.first_at ?? raw.createdAt ?? raw.created_at ?? '')
  const lastAt = String(raw.lastAt ?? raw.last_at ?? raw.createdAt ?? raw.created_at ?? '')
  if (date === '—' && (firstAt || lastAt)) date = dateFromIso(firstAt || lastAt)
  return {
    domain,
    date,
    conversationId: conversationId || null,
    findingsCount: Number.isFinite(findingsCount) ? findingsCount : 0,
    createdAt,
    firstAt,
    lastAt,
  }
}

/** Conversation id from API is a UUID; reject timestamps (e.g. "1771200395728") to avoid backend error. */
export function isConversationUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id).trim())
}

/** Format ISO date string for display in GMT+8 (e.g. "Feb 10, 2026 14:30") */
export function formatReportTime(iso: string | null | undefined): string {
  return formatDateTime(iso)
}

/** Format duration between two ISO date strings (e.g. "2h 15m", "45m") */
export function formatReportDuration(startIso: string | null | undefined, endIso: string | null | undefined): string {
  if (!startIso || !endIso) return '—'
  try {
    const start = new Date(startIso).getTime()
    const end = new Date(endIso).getTime()
    const ms = Math.max(0, end - start)
    const sec = Math.floor(ms / 1000)
    const min = Math.floor(sec / 60)
    const hr = Math.floor(min / 60)
    if (hr > 0) return `${hr}h ${min % 60}m`
    if (min > 0) return `${min}m`
    return `${sec}s`
  } catch {
    return '—'
  }
}

export const PENTEST_CHECKLIST_ORDER = ['recon', 'input_handling', 'auth_session', 'access_control', 'business_logic', 'other'] as const
export const PENTEST_SECTION_LABELS: Record<string, string> = {
  recon: 'Recon',
  input_handling: 'Input handling',
  auth_session: 'Auth & session',
  access_control: 'Access control',
  business_logic: 'Business logic',
  other: 'Other',
}

/** Compare job lists so we only update state when something actually changed (avoids flicker). */
export function jobsEqual(
  a: Array<{ job_id: string; status: string; phase_display?: string; current_section_display?: string | null; checklist?: Record<string, boolean>; last_action_summary?: string | null }>,
  b: Array<{ job_id: string; status: string; phase_display?: string; current_section_display?: string | null; checklist?: Record<string, boolean>; last_action_summary?: string | null }>,
): boolean {
  if (a.length !== b.length) return false
  return a.every((x, i) => {
    const y = b[i]
    const checklistSame = JSON.stringify(x.checklist ?? {}) === JSON.stringify(y.checklist ?? {})
    return x.job_id === y.job_id && x.status === y.status && (x.phase_display ?? '') === (y.phase_display ?? '') && (x.current_section_display ?? '') === (y.current_section_display ?? '') && checklistSame && (x.last_action_summary ?? '') === (y.last_action_summary ?? '')
  })
}

export function hacktivityListEqual(a: HacktivityRow[], b: HacktivityRow[]): boolean {
  if (a.length !== b.length) return false
  return a.every((x, i) => x.id === b[i].id)
}

export function hacktivityConversationsEqual(a: HacktivityConversationRow[], b: HacktivityConversationRow[]): boolean {
  if (a.length !== b.length) return false
  return a.every((x, i) => x.conversationId === b[i].conversationId && x.count === b[i].count)
}

/** Pentest-related keywords for chat type detection */
const PENTEST_KEYWORDS = /\b(pentest|penetration|vulnerability|exploit|scan|security test|hack|nmap|sql injection|xss|csrf|rce|lfi|rfi|sqli|recon|payload|cve|owasp|burp|metasploit|nikto|dirb|gobuster|subfinder|httpx)\b/i

/** Detect chat type from raw user input text (for instant sidebar classification) */
export function detectChatTypeFromInput(input: string): 'pentest' | 'qa' {
  return PENTEST_KEYWORDS.test(input) ? 'pentest' : 'qa'
}

/** Generate a short summary from raw user input */
export function generateSummaryFromInput(input: string): string {
  const trimmed = input.trim()
  if (trimmed.length <= 80) return trimmed
  return trimmed.substring(0, 77) + '...'
}

/** Detect chat type from message content and job association */
function detectChatType(messages: Message[], jobId?: string | null): 'pentest' | 'qa' | 'general' {
  if (jobId) return 'pentest'
  for (const msg of messages) {
    if (msg.role === 'user' && PENTEST_KEYWORDS.test(msg.content)) return 'pentest'
  }
  if (messages.length > 0) return 'qa'
  return 'general'
}

/** Generate a short summary from the first few messages */
function generateSummary(messages: Message[]): string {
  const userMsgs = messages.filter((m) => m.role === 'user').slice(0, 3)
  if (userMsgs.length === 0) return ''
  const first = userMsgs[0].content.trim()
  // Use first user message, truncated to ~80 chars
  if (first.length <= 80) return first
  return first.substring(0, 77) + '...'
}

/** Map DB conversation + messages to ChatHistory entry */
export function conversationToChatHistory(
  conv: {
    id: string
    title?: string | null
    messages?: Array<{
      id: string
      role: string
      content?: string | null
      createdAt: string
      parts?: Array<{ type: string; content: string; metadata?: Record<string, any> }>
    }>
    createdAt: string
    updatedAt: string
    pentestJobId?: string | null
    job_id?: string | null
  },
  jobIdFromUrl?: string | null,
): ChatHistory {
  const messages: Message[] = (conv.messages || [])
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((m) => {
      // Extract details, thinking, followUps from message parts
      let details: string | undefined
      let thinking: string | undefined
      let followUps: string[] | undefined

      if (m.parts && m.parts.length > 0) {
        for (const part of m.parts) {
          if (part.type === 'details' && part.content) {
            details = part.content
          } else if (part.type === 'thinking' && part.content) {
            thinking = part.content
          } else if (part.metadata?.followUps === true && part.content) {
            try {
              followUps = JSON.parse(part.content)
            } catch { /* ignore malformed */ }
          }
        }
      }

      return {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content || '',
        timestamp: new Date(m.createdAt),
        done: true,
        ...(details && { details }),
        ...(thinking && { thinking, thinkingDisplay: thinking }),
        ...(followUps && { followUps }),
      }
    })
  const jobId = conv.pentestJobId ?? jobIdFromUrl
  const chatType = detectChatType(messages, jobId)
  const summary = generateSummary(messages)
  return {
    id: conv.id,
    title: conv.title || 'New Chat',
    messages,
    createdAt: new Date(conv.createdAt),
    updatedAt: new Date(conv.updatedAt),
    chatType,
    summary,
    ...(jobId ? { jobId } : {}),
  }
}
