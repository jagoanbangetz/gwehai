/** Shared types for the Dashboard module. */

export interface Tool {
  id: string
  name: string
  input?: any
  logs: string[]
  status: 'running' | 'ok' | 'error'
  output?: any
  messageId: string
  /** Reasoning shown above the terminal (e.g. "Searching memory for: ...") */
  reasoning?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  eventType?: string // 'thinking' | 'tool' | 'result' | 'content' | 'status' | 'error' | 'done'
  toolName?: string
  isStreaming?: boolean
  done?: boolean
  toolIds?: string[]
  /** Selected model key for this turn (shown as badge on assistant bubble) */
  modelKey?: 'auto' | 'openai_gpt55' | 'openai_gpt5' | 'openai_gpt4o' | 'openai_o3' | 'openai_o4mini' | 'openai_codex' | 'claude_fable5' | 'claude_opus48' | 'claude_sonnet4' | 'claude_haiku4' | 'gemini_31_pro' | 'gemini_3_flash' | 'gemini_25_pro' | 'gemini_ultra' | 'deepseek_v4' | 'deepseek_v4_flash' | 'deepseek_r1' | 'deepseek_chat' | 'deepseek_coder'
  /** AI thinking (<think> block) — shown above the final reply */
  thinking?: string
  /** Animated substring of thinking for typing effect; hidden when done */
  thinkingDisplay?: string
  /** Animated substring of content for typing effect on final reply */
  contentDisplay?: string
  /** Optional longer markdown for "More details" (simple conversation JSON contract) */
  details?: string
  /** Optional follow-up suggestion chips (simple conversation JSON contract) */
  followUps?: string[]
}

export interface ToolState {
  activeTools: number
  hasTools: boolean
  toolsComplete: boolean
}

export interface ChatHistory {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
  /** When set, this chat is linked to a pentest job (one job = one conversation). */
  jobId?: string
}

/** One row in the Report menu: unique by (domain, conversationId, date) */
export interface ReportGroupRow {
  domain: string
  date: string
  conversationId: string | null
  findingsCount: number
  createdAt: string
  firstAt: string
  lastAt: string
}

/** Single finding (bug) for a conversation */
export interface FindingRow {
  id: string
  detail: string | null
  poc: string | null
  target: string | null
  metadata?: { title?: string; severity?: string }
  createdAt: string
}

/** One AI activity row for Hacktivity table */
export interface HacktivityRow {
  id: string
  conversationId: string | null
  domain: string | null
  result: string | null
  toolArgs: Record<string, unknown> | null
  createdAt: string
}

/** Conversation with hacktivity count (for filter dropdown) */
export interface HacktivityConversationRow {
  conversationId: string
  title: string | null
  count: number
}

export interface CurrentPlan {
  plan?: {
    name?: string
    code?: string
    monthlyPriceUsd?: number
  }
  status: string
  pointsGranted: number
  messagesSent: number
  reportsGenerated: number
}

/** Plan-based response from GET /plans/me (source of truth for quota UI) */
export interface MyPlanResponse {
  planId: string
  plan: {
    name: string
    code: string
    marketing_title: string
    marketing_footnote: string
  }
  limits_summary: {
    workers: string
    scans: string
    steps: string
    sub_agents?: string
  }
  usage?: {
    day: {
      tokens_used: number
      tokens_remaining?: number
    }
  }
  scan_limit?: {
    sessions_per_day: number
    sessions_started_today: number
  }
}

export interface PentestJob {
  job_id: string
  status: string
  user_message?: string
  conversation_id?: string
  phase_display?: string
  current_section_display?: string | null
  checklist?: Record<string, boolean>
  last_action_summary?: string | null
  createdAt?: number
}
