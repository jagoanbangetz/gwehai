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

/** Map DB conversation + messages to ChatHistory entry */
export function conversationToChatHistory(
  conv: {
    id: string
    title?: string | null
    messages?: Array<{ id: string; role: string; content?: string | null; createdAt: string }>
    createdAt: string
    updatedAt: string
    pentestJobId?: string | null
    job_id?: string | null
  },
  jobIdFromUrl?: string | null,
): ChatHistory {
  const messages: Message[] = (conv.messages || [])
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content || '',
      timestamp: new Date(m.createdAt),
      done: true,
    }))
  const jobId = conv.pentestJobId ?? jobIdFromUrl
  return {
    id: conv.id,
    title: conv.title || 'New Chat',
    messages,
    createdAt: new Date(conv.createdAt),
    updatedAt: new Date(conv.updatedAt),
    ...(jobId ? { jobId } : {}),
  }
}
