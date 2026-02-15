import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { logo } from '../assets/images'
import './Dashboard.css'
import apiClient from '../utils/api'
import { ToastContainer, Toast } from '../components/Toast'
import { getModelIcon, isProModel } from '../utils/modelIcons'
import { gwehaiClient, GwehAIEvent } from '../utils/gwehaiApi'
import MarkdownMessage from '../components/MarkdownMessage'
import PageLoader from '../components/PageLoader'
import DashboardLayout from '../components/DashboardLayout'
import ProfileFooter from '../components/ProfileFooter'
import SettingsModal from '../components/SettingsModal'
import ChatLayout from '../components/ChatLayout'
import MessagesArea, { type MessagesAreaRef } from '../components/MessagesArea'
import Composer from '../components/Composer'
import ThinkingBar from '../components/ThinkingBar'
import { GwehLogRenderer } from '../components/GwehLog'
import type { LogEvent, LogPhase } from '../components/GwehLog'
import { useMediaQuery } from '../hooks/useMediaQuery'

interface Tool {
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

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  eventType?: string // 'thinking' | 'tool' | 'result' | 'content' | 'status' | 'error' | 'done'
  toolName?: string
  isStreaming?: boolean
  done?: boolean
  toolIds?: string[]
  /** AI thinking (<think> block) — shown above the final reply */
  thinking?: string
  /** Animated substring of thinking for typing effect; hidden when done */
  thinkingDisplay?: string
  /** Animated substring of content for typing effect on final reply */
  contentDisplay?: string
}

interface ToolState {
  activeTools: number
  hasTools: boolean
  toolsComplete: boolean
}

interface ChatHistory {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
  /** When set, this chat is linked to a pentest job (one job = one conversation). */
  jobId?: string
}

/** One row in the Report menu: grouped by conversation */
interface ReportGroupRow {
  conversationId: string
  website: string
  findingsCount: number
  createdAt: string
  runStatus?: 'running' | 'finished' | 'error' | 'stopped' | string
  startedAt?: string | null
  finishedAt?: string | null
}

/** Tree row: run with agents (children) */
interface ReportTreeRow extends ReportGroupRow {
  agents?: { conversationId: string; agentRole: string | null; findingsCount: number }[]
}

/** Format ISO date string for display (e.g. "Feb 10, 2026 14:30") */
function formatReportTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

/** Format duration between two ISO date strings (e.g. "2h 15m", "45m") */
function formatReportDuration(startIso: string | null | undefined, endIso: string | null | undefined): string {
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

/** Single finding (bug) for a conversation */
interface FindingRow {
  id: string
  detail: string | null
  poc: string | null
  target: string | null
  metadata?: { title?: string; severity?: string }
  createdAt: string
}

/** One AI activity row for Hacktivity table */
interface HacktivityRow {
  id: string
  conversationId: string | null
  domain: string | null
  result: string | null
  toolArgs: Record<string, unknown> | null
  createdAt: string
}

/** Conversation with hacktivity count (for filter dropdown) */
interface HacktivityConversationRow {
  conversationId: string
  title: string | null
  count: number
}

interface CurrentPlan {
  id: string
  status: string
  startedAt: string
  expiresAt?: string | null
  pointsGranted: number
  pointsUsed: number
  reportsGenerated: number
  messagesSent: number
  plan?: {
    id: string
    code: string
    name: string
    monthlyPriceUsd?: number | null
    pointsIncluded?: number | null
  }
}

/** Map DB conversation + messages to ChatHistory entry */
function conversationToChatHistory(
  conv: {
    id: string
    title?: string | null
    messages?: Array<{ id: string; role: string; content?: string | null; createdAt: string }>
    createdAt: string
    updatedAt: string
    pentestJobId?: string | null
  },
  jobIdFromUrl?: string,
): ChatHistory {
  const messages: Message[] = (conv.messages || [])
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((m) => ({
      id: m.id,
      role: (m.role?.toLowerCase?.() || m.role) as 'user' | 'assistant',
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

const Dashboard = () => {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [chatsSectionCollapsed, setChatsSectionCollapsed] = useState(false)
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([])
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showHacktivityModal, setShowHacktivityModal] = useState(false)
  const [hacktivityList, setHacktivityList] = useState<HacktivityRow[]>([])
  const [hacktivityConversations, setHacktivityConversations] = useState<HacktivityConversationRow[]>([])
  const [selectedHacktivityConversationId, setSelectedHacktivityConversationId] = useState<string | null>(null)
  const [hacktivityPage, setHacktivityPage] = useState(1)
  const [hacktivityPageSize] = useState(20)
  const [hacktivityTotal, setHacktivityTotal] = useState(0)
  const [isLoadingHacktivity, setIsLoadingHacktivity] = useState(false)
  const [selectedHacktivityId, setSelectedHacktivityId] = useState<string | null>(null)
  const [selectedHacktivity, setSelectedHacktivity] = useState<HacktivityRow | null>(null)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [helpMessages, setHelpMessages] = useState<Message[]>([])
  const [helpInput, setHelpInput] = useState('')
  const [isHelpLoading, setIsHelpLoading] = useState(false)
  const [settingsData, setSettingsData] = useState({
    email: '',
    password: '',
    defaultLanguage: 'en',
    defaultModelId: '',
  })
  const [availableModels, setAvailableModels] = useState<any[]>([])
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [isVoiceRecording, setIsVoiceRecording] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [reports, setReports] = useState<ReportTreeRow[]>([])
  const [isLoadingReports, setIsLoadingReports] = useState(false)
  const [expandedReportIds, setExpandedReportIds] = useState<Set<string>>(new Set())
  const [reportDetailConversationId, setReportDetailConversationId] = useState<string | null>(null)
  const [reportFindings, setReportFindings] = useState<FindingRow[]>([])
  const [reportFindingsLoading, setReportFindingsLoading] = useState(false)
  const [_selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [selectedFinding, setSelectedFinding] = useState<FindingRow | null>(null)
  const [currentPlan, setCurrentPlan] = useState<CurrentPlan | null>(null)
  const [pointsBalance, setPointsBalance] = useState<number | null>(null)
  const [isLoadingPlan, setIsLoadingPlan] = useState(false)
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [conversationRunStatus, setConversationRunStatus] = useState<Record<string, 'running' | 'finished' | 'error' | 'stopped'>>({})
  const [tools, setTools] = useState<Record<string, Tool>>({}) // toolId -> Tool
  const [messageTools, setMessageTools] = useState<Record<string, string[]>>({}) // messageId -> toolIds[]
  const [messageToolState, setMessageToolState] = useState<Record<string, ToolState>>({})
  const [currentAssistantMessageId, setCurrentAssistantMessageId] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<string | null>(null)
  const [activityLog, setActivityLog] = useState<string[]>([])
  const [logEvents, setLogEvents] = useState<LogEvent[]>([])
  const [pentestChecklistProgress, setPentestChecklistProgress] = useState<{ phase: string; checklist: Record<string, boolean> } | null>(null)
  const messageToolsSnapshot = useMemo(() => messageTools, [messageTools])
  /** Mobile: <1024px — hamburger + drawer. Desktop: persistent sidebar + chevron collapse. */
  const isMobile = useMediaQuery('(max-width: 1023px)')
  const messagesAreaRef = useRef<MessagesAreaRef | null>(null)
  const userNearBottomRef = useRef(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const helpMessagesEndRef = useRef<HTMLDivElement>(null)
  const voiceRecognitionRef = useRef<any | null>(null)
  const streamingMessageRef = useRef<number | null>(null) // Index of currently streaming message
  const eventSourceRef = useRef<EventSource | null>(null) // Use ref for event source to avoid closure issues
  const currentAssistantMessageIdRef = useRef<string | null>(null)
  const messageToolStateRef = useRef<Record<string, ToolState>>({})
  const toolsRef = useRef<Record<string, Tool>>({})
  const messagesRef = useRef<Message[]>([])
  const streamMessageMapRef = useRef<Record<string, string>>({})
  const lastCompletedAssistantMessageIdRef = useRef<string | null>(null)
  const pendingAssistantMessageIdRef = useRef<string | null>(null)
  const lastReasoningFromBackendRef = useRef<string | null>(null)
  const initialDataLoadDoneRef = useRef(false)
  const initialDataLoadUserIdRef = useRef<string | undefined>(undefined)
  const sendInProgressRef = useRef(false)
  const pentestJobStreamAbortRef = useRef<AbortController | null>(null)
  /** When true, ignore all incoming SSE events so activity really stops when user clicks Stop. */
  const stopRequestedRef = useRef(false)

  /** Refetch chat list from DB (e.g. after sending a message so sidebar shows the conversation). */
  const refetchChatHistory = async () => {
    if (!user?.id) return
    try {
      const res = await apiClient.get<Array<{
        id: string
        title?: string | null
        messages?: Array<{ id: string; role: string; content?: string | null; createdAt: string }>
        createdAt: string
        updatedAt: string
        pentestJobId?: string | null
      }>>('/chat/conversations')
      const list = Array.isArray(res.data) ? res.data : (res as any).data?.conversations || []
      const history = list.map((c) => conversationToChatHistory(c))
      setChatHistory(history)
    } catch (e) {
      console.warn('Refetch chat history:', e)
    }
  }

  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration = 3000) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9)
    setToasts((prev) => [...prev, { id, message, type, duration }])
  }

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }

  const loadReports = async () => {
    try {
      setIsLoadingReports(true)
      const res = await apiClient.get('/reports?format=tree')
      const rows = res.data || []
      setReports(rows)
      setConversationRunStatus(prev => {
        const next = { ...prev }
        for (const r of rows as ReportTreeRow[]) {
          const status = String(r.runStatus || '').toLowerCase()
          if (status === 'running' || status === 'finished' || status === 'error' || status === 'stopped') {
            next[r.conversationId] = status
          }
        }
        return next
      })
    } catch (error: any) {
      console.error('Failed to load reports:', error)
      showToast(error.response?.data?.message || 'Failed to load reports.', 'error')
    } finally {
      setIsLoadingReports(false)
    }
  }

  const loadFindingsForConversation = async (conversationId: string) => {
    try {
      setReportFindingsLoading(true)
      const res = await apiClient.get(`/reports/by-run/${conversationId}`)
      setReportFindings(res.data || [])
    } catch (error: any) {
      console.error('Failed to load findings:', error)
      showToast(error.response?.data?.message || 'Failed to load findings.', 'error')
    } finally {
      setReportFindingsLoading(false)
    }
  }

  const loadFindingDetail = async (id: string) => {
    try {
      const res = await apiClient.get(`/reports/${id}`)
      setSelectedFinding(res.data)
    } catch (error: any) {
      console.error('Failed to load finding:', error)
      showToast(error.response?.data?.message || 'Failed to load finding.', 'error')
    }
  }

  const closeReportModal = () => {
    setShowReportModal(false)
    setReportDetailConversationId(null)
    setReportFindings([])
    setSelectedFindingId(null)
    setSelectedFinding(null)
  }

  const loadHacktivityConversations = async () => {
    try {
      const res = await apiClient.get('/hacktivity/conversations')
      setHacktivityConversations(Array.isArray(res.data) ? res.data : [])
    } catch (error: any) {
      console.error('Failed to load Hacktivity conversations', error)
    }
  }

  const loadHacktivity = async (page: number = 1, conversationId: string | null = null) => {
    try {
      setIsLoadingHacktivity(true)
      const params = new URLSearchParams()
      params.set('limit', String(hacktivityPageSize))
      params.set('offset', String((page - 1) * hacktivityPageSize))
      if (conversationId) params.set('conversationId', conversationId)
      const res = await apiClient.get(`/hacktivity?${params.toString()}`)
      const data = res.data || {}
      const items = Array.isArray(data.items) ? data.items : []
      const total = typeof data.total === 'number' ? data.total : 0
      setHacktivityList(items)
      setHacktivityTotal(total)
      setHacktivityPage(page)
    } catch (error: any) {
      console.error('Failed to load Hacktivity', error)
      showToast(error.response?.data?.message || 'Failed to load activity.', 'error')
    } finally {
      setIsLoadingHacktivity(false)
    }
  }

  const loadHacktivityDetail = async (id: string) => {
    try {
      const res = await apiClient.get(`/hacktivity/${id}`)
      setSelectedHacktivity(res.data)
      setSelectedHacktivityId(id)
    } catch (error: any) {
      console.error('Failed to load activity detail', error)
      showToast(error.response?.data?.message || 'Failed to load detail.', 'error')
    }
  }

  const closeHacktivityModal = () => {
    setShowHacktivityModal(false)
    setSelectedHacktivityId(null)
    setSelectedHacktivity(null)
    setSelectedHacktivityConversationId(null)
    setHacktivityPage(1)
  }

  const hacktivityTotalPages = Math.max(1, Math.ceil(hacktivityTotal / hacktivityPageSize))

  const loadPlan = async () => {
    try {
      setIsLoadingPlan(true)
      const [planRes, balanceRes] = await Promise.all([
        apiClient.get('/plans/current'),
        apiClient.get('/points/balance'),
      ])
      setCurrentPlan(planRes.data || null)
      setPointsBalance(balanceRes.data?.balance ?? null)
    } catch (error: any) {
      console.error('Failed to load plan info:', error)
      showToast(error.response?.data?.message || 'Failed to load plan information.', 'error')
    } finally {
      setIsLoadingPlan(false)
    }
  }

  const startVoiceRecognition = () => {
    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

      if (!SpeechRecognition) {
        showToast('Voice recognition is not supported in this browser.', 'warning')
        return
      }

      const recognition = new SpeechRecognition()
      recognition.lang = 'en-US'
      recognition.interimResults = true
      recognition.continuous = true

      let finalTranscript = ''

      recognition.onstart = () => {
        setIsVoiceRecording(true)
        setVoiceTranscript('')
      }

      recognition.onresult = (event: any) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' '
          } else {
            interim += transcript
          }
        }
        setVoiceTranscript((finalTranscript + interim).trim())
      }

      recognition.onerror = () => {
        showToast('Voice recognition error. Please try again.', 'error')
        setIsVoiceRecording(false)
      }

      recognition.onend = () => {
        // Keep UI open so user can confirm/cancel the captured text
      }

      voiceRecognitionRef.current = recognition
      recognition.start()
    } catch (err) {
      console.error('Voice recognition init failed', err)
      showToast('Unable to start voice recognition.', 'error')
    }
  }

  const stopVoiceRecognition = () => {
    if (voiceRecognitionRef.current) {
      try {
        voiceRecognitionRef.current.stop()
      } catch {
        // ignore
      }
    }
  }

  const cancelVoiceInput = () => {
    stopVoiceRecognition()
    setIsVoiceRecording(false)
    setVoiceTranscript('')
  }

  const confirmVoiceInput = () => {
    stopVoiceRecognition()
    if (voiceTranscript.trim()) {
      setInput(prev =>
        prev && !prev.endsWith(' ')
          ? `${prev} ${voiceTranscript.trim()}`
          : `${prev}${voiceTranscript.trim()}`
      )
    }
    setIsVoiceRecording(false)
    setVoiceTranscript('')
    inputRef.current?.focus()
  }

  useEffect(() => {
    if (showReportModal) {
      loadReports()
    }
  }, [showReportModal])

  useEffect(() => {
    if (showHacktivityModal) {
      loadHacktivityConversations()
      setSelectedHacktivityConversationId(null)
      setHacktivityPage(1)
      loadHacktivity(1, null)
    }
  }, [showHacktivityModal])

  useEffect(() => {
    if (showPlanModal) {
      loadPlan()
    }
  }, [showPlanModal])

  // When switching to mobile: close drawer and expand chat so UI is usable
  useEffect(() => {
    if (isMobile) {
      setChatCollapsed(false)
      setSidebarOpen(false)
    }
  }, [isMobile])

  // Close drawer when clicking outside sidebar (mobile only)
  useEffect(() => {
    if (!sidebarOpen || !isMobile) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const sidebar = document.querySelector('.app-sidebar')
      const hamburger = document.querySelector('.app-topbar-hamburger')
      if (sidebar && !sidebar.contains(target) && !hamburger?.contains(target)) {
        setSidebarOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [sidebarOpen, isMobile])

  const loadUserProfile = async () => {
    try {
      const response = await apiClient.get('/auth/me')
      const profile = response.data
      setSettingsData({
        email: profile.email || '',
        password: '',
        defaultLanguage: profile.defaultLanguage || 'en',
        defaultModelId: profile.defaultModelId || '',
      })
    } catch (error) {
      console.error('Failed to load user profile:', error)
    }
  }

  const loadModels = async () => {
    try {
      const response = await apiClient.get('/chat/models')
      setAvailableModels(response.data || [])
    } catch (error) {
      console.error('Failed to load models:', error)
      // Fallback to default models
      setAvailableModels([
        { id: 'claude-opus-4.5', name: 'Claude-Opus-4.5' },
        { id: 'chatgpt-5.2', name: 'ChatGPT-5.2' },
        { id: 'gemini-3', name: 'Gemini-3' },
        { id: 'grok-4', name: 'Grok-4' },
      ])
    }
  }

  const handleSaveSettings = async () => {
    setIsSavingSettings(true)
    try {
      const updateData: any = {}
      if (settingsData.email && settingsData.email !== user?.email) {
        updateData.email = settingsData.email
      }
      if (settingsData.password) {
        updateData.password = settingsData.password
      }
      if (settingsData.defaultLanguage) {
        updateData.defaultLanguage = settingsData.defaultLanguage
      }
      if (settingsData.defaultModelId) {
        updateData.defaultModelId = settingsData.defaultModelId
      }

      await apiClient.post('/auth/settings', updateData)
      
      // Reload user profile to get updated data
      await loadUserProfile()
      
      showToast('Settings saved successfully!', 'success')
      setShowSettingsModal(false)
    } catch (error: any) {
      console.error('Failed to save settings:', error)
      showToast(error.response?.data?.message || 'Failed to save settings. Please try again.', 'error')
    } finally {
      setIsSavingSettings(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    // Avoid duplicate /me and /models in dev (e.g. React Strict Mode double-mount)
    const userId = user?.id
    if (initialDataLoadUserIdRef.current !== userId) {
      initialDataLoadDoneRef.current = false
      initialDataLoadUserIdRef.current = userId
    }
    if (initialDataLoadDoneRef.current) return
    initialDataLoadDoneRef.current = true

    const loadData = async () => {
      await Promise.all([loadUserProfile(), loadModels()])
    }
    loadData()

    // Load chat history from DB (conversations are saved when user sends messages via GwehAI)
    const loadConversations = async () => {
      try {
        const res = await apiClient.get<Array<{
          id: string
          title?: string | null
          messages?: Array<{ id: string; role: string; content?: string | null; createdAt: string }>
          createdAt: string
          updatedAt: string
          pentestJobId?: string | null
        }>>('/chat/conversations')
        const list = Array.isArray(res.data) ? res.data : (res as any).data?.conversations || []
        const history = list.map((c) => conversationToChatHistory(c))
        setChatHistory(history)

        // URL ?session_id= or ?conversation_id= or ?conversationId= or ?jobs_id= → open that chat and continue
        const conversationId =
          searchParams.get('session_id') ||
          searchParams.get('conversation_id') ||
          searchParams.get('conversationId') ||
          searchParams.get('jobs_id')
        const jobIdFromUrl = searchParams.get('jobId') || undefined
        if (conversationId) {
          try {
            const { data: conv } = await apiClient.get<{
              id: string
              title?: string | null
              messages?: Array<{ id: string; role: string; content?: string | null; createdAt: string }>
              createdAt: string
              updatedAt: string
              pentestJobId?: string | null
            }>(`/chat/conversations/${conversationId}`)
            if (conv) {
              const chat = conversationToChatHistory(conv, jobIdFromUrl)
              setMessages(chat.messages)
              setCurrentChatId(chat.id)
              setCurrentConversationId(chat.id)
              // Ensure this conversation appears in sidebar (e.g. newly created from Pentest "Open Conversation")
              setChatHistory(prev => {
                if (prev.some(c => c.id === chat.id)) return prev
                return [chat, ...prev]
              })
            }
          } catch (e) {
            console.warn('Could not load conversation from URL:', conversationId, e)
          }
        }
      } catch (e) {
        console.error('Error loading chat history from DB:', e)
        // Fallback: load from localStorage if API fails
        const savedHistory = localStorage.getItem(`gwehai_chat_history_${user?.id}`)
        if (savedHistory) {
          try {
            const parsed = JSON.parse(savedHistory)
            setChatHistory(parsed.map((chat: any) => ({
              ...chat,
              createdAt: new Date(chat.createdAt),
              updatedAt: new Date(chat.updatedAt),
              messages: chat.messages.map((msg: any) => ({
                ...msg,
                timestamp: new Date(msg.timestamp)
              }))
            })))
          } catch (err) {
            console.error('Error loading chat history from localStorage:', err)
          }
        }
      }
    }
    loadConversations()
  }, [isAuthenticated, navigate, user?.id, searchParams])

  useEffect(() => {
    // Save chat history when messages change
    if (messages.length > 0 && currentChatId && user?.id) {
      setChatHistory(prev => {
        const chat = prev.find(c => c.id === currentChatId)
        if (chat) {
          const updatedChat = {
            ...chat,
            messages,
            updatedAt: new Date(),
            title: messages.find(m => m.role === 'user')?.content.substring(0, 50) || 'New Chat'
          }
          const updatedHistory = prev.map(c => 
            c.id === currentChatId ? updatedChat : c
          )
          localStorage.setItem(`gwehai_chat_history_${user.id}`, JSON.stringify(updatedHistory))
          return updatedHistory
        }
        return prev
      })
    } else if (messages.length > 0 && !currentChatId && user?.id) {
      // Create new chat if messages exist but no current chat
      const newChatId = Date.now().toString()
      const newChat: ChatHistory = {
        id: newChatId,
        title: messages.find(m => m.role === 'user')?.content.substring(0, 50) || 'New Chat',
        messages,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      setCurrentChatId(newChatId)
      setChatHistory(prev => {
        const updated = [newChat, ...prev]
        localStorage.setItem(`gwehai_chat_history_${user.id}`, JSON.stringify(updated))
        return updated
      })
    }
  }, [messages, currentChatId, user?.id])

  // Active pentest job for current view: either the running job or the opened chat's linked job.
  const activePentestJobId = currentJobId ?? (currentChatId ? chatHistory.find((c) => c.id === currentChatId)?.jobId : null) ?? null

  // Fetch pentest job summary (phase + checklist) when viewing a pentest conversation; clear when leaving.
  const fetchPentestChecklistProgress = useCallback(async (jobId: string) => {
    try {
      const { data } = await apiClient.get<{ phase?: string; checklist?: Record<string, boolean> }>(`/pentest-jobs/${jobId}`)
      setPentestChecklistProgress({
        phase: data.phase ?? 'recon',
        checklist: data.checklist ?? {},
      })
    } catch {
      setPentestChecklistProgress(null)
    }
  }, [])

  useEffect(() => {
    if (!activePentestJobId) {
      setPentestChecklistProgress(null)
      return
    }
    fetchPentestChecklistProgress(activePentestJobId)
  }, [activePentestJobId, fetchPentestChecklistProgress])

  // When user opens a pentest-linked conversation, auto-connect to job events SSE so tools log streams in the chat.
  useEffect(() => {
    const chat = currentChatId ? chatHistory.find((c) => c.id === currentChatId) : null
    const jobId = chat?.jobId ?? null
    if (!jobId || !user?.id) {
      pentestJobStreamAbortRef.current?.abort()
      pentestJobStreamAbortRef.current = null
      return
    }
    const ac = new AbortController()
    pentestJobStreamAbortRef.current = ac
    const baseUrl = apiClient.defaults.baseURL || '/api'
    const token =
      (() => {
        try {
          const u = localStorage.getItem('scout_user')
          if (!u) return null
          const d = JSON.parse(u)
          return d?.token ?? d?.access_token ?? null
        } catch {
          return null
        }
      })() ?? ''
    const url = `${baseUrl}/pentest-jobs/${jobId}/events/stream`
    fetch(url, {
      signal: ac.signal,
      headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok || !res.body) return
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        while (!ac.signal.aborted) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const parts = buf.split('\n\n')
          buf = parts.pop() ?? ''
          for (const block of parts) {
            let eventType = ''
            let dataStr = ''
            for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) eventType = line.slice(7).trim()
              if (line.startsWith('data: ')) dataStr = line.slice(6)
            }
            if (!dataStr) continue
            try {
              const data = JSON.parse(dataStr)
              if (eventType === 'job_event') {
                const msg = data.message ?? (data.kind === 'tool' ? '(tool output)' : '')
                if (msg) setActivityLog((prev) => [...prev.slice(-99), msg])
                if (data.kind === 'state') fetchPentestChecklistProgress(jobId)
              }
              if (eventType === 'job_finished' && data.status) {
                setConversationRunStatus((prev) => ({
                  ...prev,
                  ...(currentChatId ? { [currentChatId]: String(data.status) } : {}),
                }))
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        console.warn('Pentest job events stream error:', err)
      })
    return () => {
      ac.abort()
      pentestJobStreamAbortRef.current = null
    }
  }, [currentChatId, chatHistory, user?.id, fetchPentestChecklistProgress])

  const handleNewChat = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    pentestJobStreamAbortRef.current?.abort()
    pentestJobStreamAbortRef.current = null
    setSearchParams({})
    setMessages([])
    setCurrentChatId(null)
    setCurrentConversationId(null)
    setCurrentJobId(null)
    setPentestChecklistProgress(null)
    setTools({})
    setMessageTools({})
    setMessageToolState({})
    setCurrentAssistantMessageId(null)
    streamingMessageRef.current = null
    setIsLoading(false)
    inputRef.current?.focus()
    
    // Close drawer on mobile when selecting a chat
    if (isMobile) setSidebarOpen(false)
  }

  const handleLoadChat = async (chatId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setSearchParams({ session_id: chatId })
    setCurrentChatId(chatId)
    setCurrentConversationId(chatId)
    setCurrentJobId(null)
    setMessageTools({})
    setMessageToolState({})
    setCurrentAssistantMessageId(null)
    streamingMessageRef.current = null
    setIsLoading(false)

    try {
      const { data: conv } = await apiClient.get<{
        id: string
        title?: string | null
        messages?: Array<{ id: string; role: string; content?: string | null; createdAt: string }>
        createdAt: string
        updatedAt: string
      }>(`/chat/conversations/${chatId}`)
      if (conv) {
        const chat = conversationToChatHistory(conv)
        const localChat = chatHistory.find(c => c.id === chatId)
        const apiCount = chat.messages.length
        const localCount = localChat?.messages?.length ?? 0
        // Prefer local messages when we have more than API (avoid older messages disappearing)
        if (localChat && localCount > apiCount) {
          setMessages(localChat.messages)
        } else {
          setMessages(chat.messages)
        }
      }
    } catch (e) {
      console.warn('Could not load conversation detail:', chatId, e)
      const chat = chatHistory.find(c => c.id === chatId)
      if (chat) setMessages(chat.messages)
    }

    if (isMobile) setSidebarOpen(false)
  }

  const handleDeleteChat = async (chatId: string) => {
    try {
      await apiClient.delete(`/chat/conversations/${chatId}`)
    } catch (e) {
      // 404 or not found: might be old localStorage-only chat; still remove from list
      console.warn('Delete conversation:', e)
    }
    const updatedHistory = chatHistory.filter(c => c.id !== chatId)
    setChatHistory(updatedHistory)
    localStorage.setItem(`gwehai_chat_history_${user?.id}`, JSON.stringify(updatedHistory))
    if (currentChatId === chatId) {
      setMessages([])
      setCurrentChatId(null)
      setCurrentConversationId(null)
    }
    setOpenMenuId(null)
  }

  const handleRenameChat = (chatId: string) => {
    const chat = chatHistory.find(c => c.id === chatId)
    if (chat) {
      setEditingChatId(chatId)
      setEditTitle(chat.title)
      setOpenMenuId(null)
    }
  }

  const handleSaveRename = (chatId: string, e?: React.KeyboardEvent) => {
    if (e && e.key !== 'Enter') return
    if (!editTitle.trim()) {
      handleCancelRename()
      return
    }
    
    const updatedHistory = chatHistory.map(chat =>
      chat.id === chatId ? { ...chat, title: editTitle.trim() } : chat
    )
    setChatHistory(updatedHistory)
    localStorage.setItem(`gwehai_chat_history_${user?.id}`, JSON.stringify(updatedHistory))
    setEditingChatId(null)
    setEditTitle('')
  }

  const handleCancelRename = () => {
    setEditingChatId(null)
    setEditTitle('')
  }

  const handleHelpSend = async () => {
    if (!helpInput.trim() || isHelpLoading) return

    const userMessage: Message = {
      id: createMessageId(),
      role: 'user',
      content: helpInput,
      timestamp: new Date()
    }

    setHelpMessages(prev => [...prev, userMessage])
    setHelpInput('')
    setIsHelpLoading(true)

    try {
      const response = await apiClient.post('/chat', {
        message: helpInput,
        conversation: []
      })

      const assistantMessage: Message = {
        id: createMessageId(),
        role: 'assistant',
        content: response.data.response || response.data.message?.content || 'I\'m here to help! How can I assist you with GwehAI?',
        timestamp: new Date()
      }

      setHelpMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Help chat error:', error)
      const errorMessage: Message = {
        id: createMessageId(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again or contact support.',
        timestamp: new Date()
      }
      setHelpMessages(prev => [...prev, errorMessage])
    } finally {
      setIsHelpLoading(false)
    }
  }

  useEffect(() => {
    if (helpMessages.length > 0) {
      helpMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [helpMessages])

  useEffect(() => {
    currentAssistantMessageIdRef.current = currentAssistantMessageId
  }, [currentAssistantMessageId])

  useEffect(() => {
    messageToolStateRef.current = messageToolState
  }, [messageToolState])

  useEffect(() => {
    toolsRef.current = tools
  }, [tools])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Typing effect for thinking block — Cursor-style: faster, snappier
  const THINKING_TYPING_CHARS = 4
  const THINKING_TYPING_MS = 22
  useEffect(() => {
    const toAnimate = messages.filter(
      (m): m is Message & { thinking: string } =>
        m.role === 'assistant' &&
        Boolean((m.thinking ?? '').trim()) &&
        ((m.thinkingDisplay?.length ?? 0) < (m.thinking ?? '').length)
    )
    if (toAnimate.length === 0) return
    const message = toAnimate[toAnimate.length - 1]
    const messageId = message.id
    const fullText = message.thinking!
    const currentLen = message.thinkingDisplay?.length ?? 0
    const nextLen = Math.min(currentLen + THINKING_TYPING_CHARS, fullText.length)
    const timer = setTimeout(() => {
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId ? { ...m, thinkingDisplay: fullText.slice(0, nextLen) } : m
        )
      )
    }, THINKING_TYPING_MS)
    return () => clearTimeout(timer)
  }, [messages])

  // Typing effect for final reply — Cursor-style: faster, snappier
  const CONTENT_TYPING_CHARS = 5
  const CONTENT_TYPING_MS = 18
  useEffect(() => {
    const toAnimate = messages.filter(
      (m): m is Message & { content: string } =>
        m.role === 'assistant' &&
        !m.done &&
        (m.content?.length ?? 0) > 0 &&
        (
          !m.thinking?.trim() ||
          (m.thinkingDisplay?.length ?? 0) >= (m.thinking?.length ?? 0)
        ) &&
        ((m.contentDisplay?.length ?? 0) < (m.content?.length ?? 0))
    )
    if (toAnimate.length === 0) return
    const message = toAnimate[toAnimate.length - 1]
    const messageId = message.id
    const fullText = message.content!
    const currentLen = message.contentDisplay?.length ?? 0
    const nextLen = Math.min(currentLen + CONTENT_TYPING_CHARS, fullText.length)
    const timer = setTimeout(() => {
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId ? { ...m, contentDisplay: fullText.slice(0, nextLen) } : m
        )
      )
    }, CONTENT_TYPING_MS)
    return () => clearTimeout(timer)
  }, [messages])

  // Cleanup event source on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  // Auto-scroll to bottom when new message and user is near bottom (ChatGPT-style)
  useEffect(() => {
    if (userNearBottomRef.current) {
      messagesAreaRef.current?.scrollToBottom('smooth')
    }
  }, [messages])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      // Check if click is outside any menu container
      const menuContainer = (target as Element).closest('.chat-menu-container')
      if (!menuContainer) {
        setOpenMenuId(null)
      }
    }

    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [openMenuId])

  const createMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  const addAssistantMessage = (eventType?: Message['eventType']) => {
    const id = createMessageId()
    const newMessage: Message = {
      id,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      done: false,
      // Default to 'planning' if no eventType specified
      eventType: eventType || 'planning',
    }
    setMessages(prev => {
      const updated = [...prev, newMessage]
      messagesRef.current = updated
      return updated
    })
    setCurrentAssistantMessageId(id)
    currentAssistantMessageIdRef.current = id
    return id
  }

  const addUserMessage = (content: string) => {
    const id = createMessageId()
    const newMessage: Message = {
      id,
      role: 'user',
      content,
      timestamp: new Date(),
      done: true,
    }
    setMessages(prev => {
      const updated = [...prev, newMessage]
      messagesRef.current = updated
      return updated
    })
    return id
  }

  const updateMessageContent = (messageId: string, delta: string) => {
    if (!delta) return
    setMessages(prev => {
      const updated = prev.map(message =>
        message.id === messageId
          ? {
              ...message,
              content: (message.content || '') + delta,
              contentDisplay: message.contentDisplay !== undefined ? message.contentDisplay : '', // start typing effect from empty
              isStreaming: true,
              done: false,
              eventType: 'content',
            }
          : message
      )
      messagesRef.current = updated
      return updated
    })
  }

  const markMessageDone = (messageId: string) => {
    setMessages(prev => {
      const updated = prev.map(message =>
        message.id === messageId
          ? {
              ...message,
              isStreaming: false,
              done: true,
              contentDisplay: message.content, // snap to full so final reply shows complete
            }
          : message
      )
      messagesRef.current = updated
      return updated
    })
  }

  const ensureToolList = (messageId: string) => {
    setMessageTools(prev => (prev[messageId] ? prev : { ...prev, [messageId]: [] }))
  }

  const ensureToolState = (messageId: string) => {
    setMessageToolState(prev => {
      if (prev[messageId]) return prev
      return {
        ...prev,
        [messageId]: { activeTools: 0, hasTools: false, toolsComplete: false },
      }
    })
  }

  const startTool = (toolCallId: string, name: string, input: any, targetMessageId?: string | null, reasoning?: string) => {
    let messageId = targetMessageId || currentAssistantMessageIdRef.current
    const currentMsg = messageId ? messagesRef.current.find(m => m.id === messageId) : undefined
    const toolState = messageId ? messageToolStateRef.current[messageId] : undefined

    // Create new message if: no message, message is done, or tools already completed
    if (!messageId || (currentMsg && currentMsg.done) || (toolState && toolState.toolsComplete)) {
      messageId = addAssistantMessage('tool')
    }

    ensureToolList(messageId)
    ensureToolState(messageId)

    const newToolState = {
      activeTools: (messageToolStateRef.current[messageId!]?.activeTools || 0) + 1,
      hasTools: true,
      toolsComplete: false,
    }
    messageToolStateRef.current[messageId!] = newToolState

    setMessageToolState(prev => ({
      ...prev,
      [messageId!]: newToolState,
    }))

    const newTool: Tool = {
      id: toolCallId,
      name: name || 'tool',
      input,
      logs: [],
      status: 'running',
      messageId: messageId!,
      reasoning,
    }
    toolsRef.current[toolCallId] = newTool

    setTools(prev => ({
      ...prev,
      [toolCallId]: newTool,
    }))

    setMessageTools(prev => ({
      ...prev,
      [messageId!]: [...(prev[messageId!] || []), toolCallId],
    }))
  }

  const appendToolLog = (toolCallId: string, text: string) => {
    const tool = toolsRef.current[toolCallId]
    if (!tool) return
    const updatedTool = {
      ...tool,
      logs: [...tool.logs, text],
    }
    toolsRef.current[toolCallId] = updatedTool

    setTools(prev => ({
      ...prev,
      [toolCallId]: updatedTool,
    }))
  }

  const endTool = (toolCallId: string, status: 'ok' | 'error', output: any) => {
    const tool = toolsRef.current[toolCallId]
    if (!tool) return
    
    const updatedTool = { ...tool, status, output }
    toolsRef.current[toolCallId] = updatedTool
    setTools(prev => ({
      ...prev,
      [toolCallId]: updatedTool,
    }))

    const messageId = tool.messageId
    if (!messageId) return

    const state = messageToolStateRef.current[messageId]
    if (!state) return

    const activeTools = Math.max(0, state.activeTools - 1)
    const newState = {
      ...state,
      activeTools,
      toolsComplete: activeTools === 0 && state.hasTools,
    }
    messageToolStateRef.current[messageId] = newState

    setMessageToolState(prev => ({
      ...prev,
      [messageId]: newState,
    }))
  }

  const handleStopJob = async () => {
    if (!currentJobId) return
    // 1) Stop all activity immediately: ignore any further SSE events
    stopRequestedRef.current = true
    // 2) Close chat SSE so no more events are received
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    // 3) Abort pentest job events stream (stops live tool log updates)
    pentestJobStreamAbortRef.current?.abort()
    pentestJobStreamAbortRef.current = null
    try {
      await gwehaiClient.stopJob(currentJobId)
    } catch (_e) {
      showToast('Failed to stop job.', 'error')
    }
    // 4) Clear all running state so UI shows stopped
    setCurrentJobId(null)
    setIsLoading(false)
    sendInProgressRef.current = false
    setCurrentStep(null)
    streamingMessageRef.current = null
    currentAssistantMessageIdRef.current = null
    if (currentConversationId) {
      setConversationRunStatus((prev) => ({ ...prev, [currentConversationId]: 'stopped' }))
    }
    setActivityLog((prev) => [...prev.slice(-49), 'Text: Stopped by user'])
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant' && last.isStreaming)
        return prev.map((m, i) => (i === prev.length - 1 ? { ...m, isStreaming: false, content: (m.content || '') + '\n\n_Pentest stopped._' } : m))
      return prev
    })
    showToast('Pentest stopped.', 'info')
  }

  /** Send the current input or a given message (e.g. from suggestion button). */
  const handleSendWithText = async (messageOverride?: string) => {
    const userInput = (messageOverride ?? input.trim()).trim()
    if (!userInput || isLoading) return
    if (sendInProgressRef.current) return

    const lower = userInput.toLowerCase()

    // 1) Stop command — user can type "stop" or "stop pentest" to stop the running job
    if (lower === 'stop' || lower === 'stop pentest' || lower === 'stop the pentest' || lower === 'stop the scan') {
      addUserMessage(userInput)
      setInput('')
      inputRef.current?.focus()
      if (currentJobId) {
        await handleStopJob()
      } else {
        addAssistantMessage('No pentest is currently running.')
      }
      sendInProgressRef.current = false
      return
    }

    const messageToSend = userInput
    addUserMessage(messageToSend)
    addAssistantMessage('thinking')
    if (!messageOverride) setInput('')
    inputRef.current?.focus()

    stopRequestedRef.current = false
    sendInProgressRef.current = true
    const isNewChat = !currentChatId
    setIsLoading(true)
    setCurrentStep(null)
    setActivityLog([])
    setLogEvents([])
    if (currentConversationId) {
      setConversationRunStatus(prev => ({ ...prev, [currentConversationId]: 'running' }))
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    try {
      const jobResponse = await gwehaiClient.startScan(
        messageToSend,
        false,
        currentConversationId || undefined
      )
      const jobId = jobResponse.job_id
      setCurrentJobId(jobId)
      const convId = jobResponse.conversation_id ?? undefined
      if (convId) {
        setCurrentConversationId(convId)
        setConversationRunStatus(prev => ({ ...prev, [convId]: 'running' }))
        // New chat: add to history with DB conversation id so we can continue later
        if (isNewChat) {
          setCurrentChatId(convId)
          setChatHistory(prev => {
            const newChat: ChatHistory = {
              id: convId,
              title: messageToSend.substring(0, 50),
              messages: messagesRef.current,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
            const updated = [newChat, ...prev.filter(c => c.id !== convId)]
            if (user?.id) localStorage.setItem(`gwehai_chat_history_${user.id}`, JSON.stringify(updated))
            return updated
          })
        }
      }

      // Step 2: Assistant message already added above with "Thinking..." — connect to SSE
      // Step 3: Connect to SSE for real-time updates
      const es = gwehaiClient.connectToEvents(
        jobId,
        (event: GwehAIEvent) => {
          handleStreamEvent(event, -1)
        },
        (_error) => {
          // Connection failed after multiple retries
          console.warn('SSE connection failed after retries for job:', jobId)
          sendInProgressRef.current = false
          setIsLoading(false)
          setCurrentStep(null)
          setActivityLog(prev => [...prev.slice(-49), 'Text: Connection lost'])
          streamingMessageRef.current = null
          eventSourceRef.current = null

          // Show error message to user
          setMessages(prev => {
            const lastMessage = prev[prev.length - 1]
            if (lastMessage && lastMessage.role === 'assistant' && lastMessage.isStreaming) {
              return prev.map((msg, idx) => 
                idx === prev.length - 1 
                  ? { ...msg, isStreaming: false, content: msg.content || 'Connection lost. Please try again.' }
                  : msg
              )
            }
            return prev
          })
          
          showToast('Connection lost. The response may be incomplete.', 'warning')
        },
        () => {
          // Connection opened successfully - no need to log
        }
      )

      eventSourceRef.current = es
    } catch (error: any) {
      console.error('Chat error:', error)
      setIsLoading(false)
      streamingMessageRef.current = null
      sendInProgressRef.current = false
      
      // Remove the empty streaming message if it was added
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1]
        if (lastMessage && lastMessage.role === 'assistant' && !lastMessage.content && lastMessage.isStreaming) {
          return prev.slice(0, -1)
        }
        return prev
      })
      
      const errorText = error.message || 'Unknown error'
      const isContextTooLong = /conversation is too long|start a new chat/i.test(errorText)
      const errorMessage: Message = {
        id: createMessageId(),
        role: 'assistant',
        content: isContextTooLong
          ? `Error: ${errorText}\n\nTip: Start a new chat to continue — your previous messages won't be sent to the model.`
          : error.message || 'I apologize, but I encountered an error. Please try again or check your connection.',
        timestamp: new Date(),
        eventType: 'error'
      }
      setMessages(prev => [...prev, errorMessage])
      
      // Show appropriate error message
      if (isContextTooLong) {
        showToast('Conversation is too long. Start a new chat to continue.', 'warning', 6000)
      } else if (errorText.includes('target URL') || errorText.includes('valid URL')) {
        showToast('Please include a URL when requesting a pentest (e.g., "pentest https://example.com")', 'warning')
      } else if (errorText.includes('Failed to fetch') || errorText.includes('NetworkError')) {
        showToast('Failed to connect to GwehAI API. Please check if the API is running.', 'error')
      } else {
        showToast(errorText.length > 100 ? errorText.substring(0, 100) + '...' : errorText, 'error')
      }
    }
  }

  const handleSend = () => handleSendWithText()

  /** Map step message body to GwehLog phase for structured log. */
  const messageToLogPhase = (body: string): LogPhase => {
    const lower = body.toLowerCase()
    if (lower.includes('planning') || lower.includes('reasoning')) return 'THINKING'
    if (lower.includes('writing response') || lower === 'done' || lower.startsWith('error:')) return 'REASONING'
    if (
      lower.includes('reading skills') ||
      lower.includes('checklist loaded') ||
      lower.includes('skill loaded') ||
      lower.includes('memory for:')
    ) return 'MODULE_LOADER'
    return 'EXECUTION'
  }

  const appendActivityStep = (step: string, agentLabel?: string) => {
    const raw = String(step || '').trim()
    if (!raw) return
    const displayBase = agentLabel && !raw.startsWith('[') ? `[${agentLabel}] ${raw}` : raw
    const prefixedMatch = displayBase.match(/^\[([^\]]+)\]\s*(.*)$/)
    const prefix = prefixedMatch ? `[${prefixedMatch[1]}] ` : ''
    const body = (prefixedMatch ? prefixedMatch[2] : displayBase).trim()
    const lower = body.toLowerCase()
    const category =
      lower.includes('planning')
        ? 'Planning'
        : (lower.startsWith('running') ||
            lower.startsWith('reading') ||
            lower.startsWith('writing') ||
            lower.startsWith('searching') ||
            lower.startsWith('sending') ||
            lower.startsWith('spawning') ||
            lower.startsWith('listing') ||
            lower.startsWith('fetching') ||
            lower.startsWith('status for session') ||
            lower.startsWith('session status'))
          ? 'Running'
          : 'Text'
    const normalizedBody = /^(planning|running|text)\s*:\s*/i.test(body) ? body : `${category}: ${body}`
    const display = `${prefix}${normalizedBody}`.trim()
    setActivityLog(prev => {
      if (prev[prev.length - 1] === display) return prev
      return [...prev.slice(-49), display]
    })
    const phase = messageToLogPhase(body)
    const logEvent: LogEvent = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ts: new Date().toISOString(),
      phase,
      message: display,
    }
    setLogEvents(prev => [...prev.slice(-199), logEvent])
  }

  const handleStreamEvent = (event: GwehAIEvent, _messageIndex: number) => {
    if (stopRequestedRef.current) return
    // Log so you can see what the UI is processing in the console
    if (event.type !== 'message_delta' && event.type !== 'content') {
      const dataSummary = event.type === 'status' ? event.data?.message
        : event.type === 'reasoning' ? event.data?.message
        : event.type === 'tool_start' ? `${event.data?.name ?? event.data?.tool} ${JSON.stringify(event.data?.input ?? {})}`
        : event.type === 'tool_log' ? (typeof event.data?.text === 'string' && event.data.text.length > 80 ? event.data.text.slice(0, 80) + '...' : event.data?.text)
        : event.type === 'tool_end' ? event.data?.status : event.data;
      console.log('[GwehAI Dashboard] handleStreamEvent:', event.type, dataSummary ?? event.data);
    }

    const getCurrentMessage = () => {
      const messageId = currentAssistantMessageIdRef.current
      return messageId ? messagesRef.current.find(message => message.id === messageId) : undefined
    }

    const ensureAssistantForText = () => {
      let messageId = currentAssistantMessageIdRef.current
      const toolState = messageId ? messageToolStateRef.current[messageId] : undefined
      const currentMessage = getCurrentMessage()
      
      // Create new message ONLY if:
      // 1. No messageId exists, OR
      // 2. Current message is done, OR
      // 3. Tools completed AND message is done (not streaming) - start new block for summary
      if (!messageId) {
        messageId = addAssistantMessage('content')
      } else if (currentMessage && currentMessage.done) {
        messageId = addAssistantMessage('content')
      } else if (toolState && toolState.toolsComplete && currentMessage?.done) {
        // Tools finished and message is done - start new block for summary
        messageId = addAssistantMessage('content')
      }
      // Otherwise keep using the same message (continue streaming)
      
      return messageId
    }

    switch (event.type) {
      case 'connected':
        return

      case 'message_id': {
        // Show "Planning..." loading when we get message_id but no content yet
        let messageId = currentAssistantMessageIdRef.current
        if (!messageId) {
          messageId = addAssistantMessage('planning')
        }
        setMessages(prev => {
          const updated = prev.map(message =>
            message.id === messageId
              ? { ...message, eventType: 'planning', isStreaming: true }
              : message
          )
          messagesRef.current = updated
          return updated
        })
        return
      }

      case 'thinking': {
        let messageId = currentAssistantMessageIdRef.current
        if (!messageId) {
          messageId = addAssistantMessage('thinking')
        }
        setMessages(prev => {
          const updated = prev.map(message =>
            message.id === messageId
              ? { ...message, content: `${event.data.message || 'Thinking...'}`, eventType: 'thinking', isStreaming: true }
              : message
          )
          messagesRef.current = updated
          return updated
        })
        return
      }

      case 'reasoning_block': {
        const thinkingText = event.data?.message || ''
        if (!thinkingText.trim()) return
        const agentLabel = event.data?.agent_label as string | undefined
        const prefix = agentLabel ? `[${agentLabel}] ` : ''
        let messageId = currentAssistantMessageIdRef.current || lastCompletedAssistantMessageIdRef.current
        if (!messageId) {
          messageId = addAssistantMessage('content')
        }
        setMessages(prev => {
          const next = prev.map(msg =>
            msg.id === messageId
              ? {
                  ...msg,
                  thinking: (msg.thinking || '') + thinkingText,
                  thinkingDisplay: '', // start typing effect from empty
                  role: 'assistant' as const,
                }
              : msg
          )
          messagesRef.current = next
          return next
        })
        const stepLabel = prefix ? `${prefix}Thinking...` : 'Thinking...'
        setCurrentStep(stepLabel)
        appendActivityStep(stepLabel)
        return
      }

      case 'reasoning': {
        const reasoningMessage = event.data?.message || 'Reasoning...'
        const agentLabel = event.data?.agent_label as string | undefined
        const prefix = agentLabel ? `[${agentLabel}] ` : ''
        const displayReasoning = prefix ? `${prefix}${reasoningMessage}` : reasoningMessage
        lastReasoningFromBackendRef.current = reasoningMessage
        setCurrentStep(displayReasoning)
        appendActivityStep(reasoningMessage, agentLabel)
        return
      }

      case 'tool':
      case 'tool_start': {
        const toolCallId = event.data.tool_call_id || `tool-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const toolName = event.data.tool || event.data.name || 'Unknown tool'
        const toolInput = event.data.input || event.data.args || {}
        let targetMessageId = lastCompletedAssistantMessageIdRef.current || currentAssistantMessageIdRef.current
        // Ensure we have an assistant message to attach the tool to (in case status arrived after tool_start)
        if (!targetMessageId) {
          targetMessageId = addAssistantMessage('executing')
        }
        const computedReasoning =
          toolName === 'memory_search'
            ? `Searching memory for: ${(toolInput.query ?? '').toString().slice(0, 60) || '...'}`
            : toolName === 'memory_get'
              ? `Reading ${(toolInput.path ?? '').toString()}`
              : toolName === 'write_file'
                ? `Writing to ${(toolInput.path ?? '').toString()}`
                : toolName === 'exec'
                  ? `Running: ${(toolInput.command ?? '').toString().trim().slice(0, 60)}${(toolInput.command ?? '').toString().length > 60 ? '...' : ''}`
                  : `Running: ${toolName}`
        const reasoningToShow = lastReasoningFromBackendRef.current ?? computedReasoning
        lastReasoningFromBackendRef.current = null
        const agentLabel = event.data?.agent_label as string | undefined
        const prefixedReasoning = agentLabel ? `[${agentLabel}] ${reasoningToShow}` : reasoningToShow
        setCurrentStep(prefixedReasoning)
        appendActivityStep(reasoningToShow, agentLabel)
        startTool(toolCallId, toolName, toolInput, targetMessageId, prefixedReasoning)
        return
      }

      case 'tool_log': {
        const logToolId = event.data.tool_call_id
        const logText = event.data.text || event.data.log || ''
        if (logToolId) {
          appendToolLog(logToolId, logText)
        }
        return
      }

      case 'tool_end':
      case 'result': {
        const endToolId = event.data.tool_call_id
        const toolStatus = event.data.status || 'ok'
        const toolOutput = event.data.output || event.data.result || null
        if (endToolId) {
          endTool(endToolId, toolStatus === 'error' ? 'error' : 'ok', toolOutput)
          // Note: Backend sends status("Planning next plan...") after all tools complete
          // So we don't need to manually set eventType here
        }
        return
      }

      case 'message_delta':
      case 'content': {
        // Extract delta/chunk from event data
        let chunk = event.data.delta || event.data.chunk || event.data.content || event.data.text || ''
        if (typeof chunk !== 'string') {
          if (chunk && typeof chunk === 'object') {
            chunk = chunk.chunk || chunk.content || chunk.text || chunk.data?.chunk || chunk.data?.content || ''
          } else {
            chunk = String(chunk || '')
          }
        }

        let cleanChunk = String(chunk)
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

        if (cleanChunk.startsWith('{') && cleanChunk.includes('"chunk"')) {
          try {
            const parsed = JSON.parse(cleanChunk)
            if (parsed?.data?.chunk) {
              cleanChunk = String(parsed.data.chunk || '')
            } else if (parsed?.chunk) {
              cleanChunk = String(parsed.chunk || '')
            }
          } catch {
            // keep cleaned text
          }
        }

        cleanChunk = String(cleanChunk || '')
        
        // Filter out invalid/empty content
        if (!cleanChunk || 
            cleanChunk === 'undefined' || 
            cleanChunk === 'null' ||
            cleanChunk === '0' ||
            cleanChunk === 'false' ||
            cleanChunk.trim().length === 0) {
          return
        }

        let messageId: string | undefined
        const incomingStreamMessageId = event.data.message_id

        if (incomingStreamMessageId) {
          messageId = streamMessageMapRef.current[incomingStreamMessageId]
          if (!messageId) {
            if (pendingAssistantMessageIdRef.current) {
              messageId = pendingAssistantMessageIdRef.current
              pendingAssistantMessageIdRef.current = null
            } else {
              messageId = addAssistantMessage('content')
            }
            streamMessageMapRef.current[incomingStreamMessageId] = messageId
          }
          currentAssistantMessageIdRef.current = messageId
        } else {
          messageId = ensureAssistantForText()
        }

        updateMessageContent(messageId, cleanChunk)
        return
      }

      case 'message_done':
      case 'content_done': {
        const incomingStreamMessageId = event.data.message_id
        const messageId = incomingStreamMessageId
          ? streamMessageMapRef.current[incomingStreamMessageId]
          : currentAssistantMessageIdRef.current
        if (messageId) {
          markMessageDone(messageId)
          lastCompletedAssistantMessageIdRef.current = messageId
          if (pendingAssistantMessageIdRef.current === messageId) {
            pendingAssistantMessageIdRef.current = null
          }
        }
        return
      }

      case 'status': {
        // Status messages: planning, running tools, per-tool description; when multi-agent, prefix with agent_label (Agent 1, Agent 2, ...)
        const statusMessage = event.data.message || ''
        const agentLabel = event.data.agent_label as string | undefined
        const prefix = agentLabel ? `[${agentLabel}] ` : ''
        const displayMessage = prefix ? `${prefix}${statusMessage}` : statusMessage
        const normalized = statusMessage.toLowerCase()

        let messageId = currentAssistantMessageIdRef.current
        // Any status means the backend is actively working; ensure loading UI is on.
        setIsLoading(true)
        let eventType: string | undefined

        if (normalized.includes('planning the plan')) {
          eventType = 'planning'
          setCurrentStep(displayMessage)
          appendActivityStep(statusMessage, agentLabel)
          const currentMessage = messageId ? messagesRef.current.find(m => m.id === messageId) : undefined
          if (!messageId || (currentMessage && currentMessage.content)) {
            messageId = addAssistantMessage('planning')
          }
          pendingAssistantMessageIdRef.current = messageId
        } else if (normalized.includes('executing') || normalized.includes('running tools')) {
          eventType = 'executing'
          const step = normalized.includes('running tools') ? 'Running tools...' : 'Executing the plan...'
          setCurrentStep(prefix ? `${prefix}${step}` : step)
          appendActivityStep(step, agentLabel)
          messageId = lastCompletedAssistantMessageIdRef.current || messageId
        } else if (normalized.includes('planning next plan')) {
          eventType = 'planning-next'
          const step = 'Planning next plan...'
          setCurrentStep(prefix ? `${prefix}${step}` : step)
          appendActivityStep(step, agentLabel)
          messageId = lastCompletedAssistantMessageIdRef.current || messageId
        } else if (normalized.includes('writing response')) {
          eventType = 'content'
          const step = 'Writing response...'
          setCurrentStep(prefix ? `${prefix}${step}` : step)
          appendActivityStep(step, agentLabel)
          messageId = lastCompletedAssistantMessageIdRef.current || messageId
        } else {
          // Per-tool status (e.g. "Reading skills/WEB_CHECKLIST.md", "Running: curl ...") — show it so user sees what AI is doing
          eventType = 'executing'
          setCurrentStep(displayMessage)
          appendActivityStep(statusMessage, agentLabel)
          messageId = lastCompletedAssistantMessageIdRef.current || messageId
        }

        if (messageId && eventType) {
          setMessages(prev => {
            const exists = prev.some(m => m.id === messageId)
            if (!exists) {
              // Race: SSE arrived before React committed addAssistantMessage — ensure message is in list
              const newMsg: Message = {
                id: messageId,
                role: 'assistant',
                content: '',
                timestamp: new Date(),
                isStreaming: true,
                done: false,
                eventType,
              }
              const updated = [...prev, newMsg]
              messagesRef.current = updated
              return updated
            }
            const updated = prev.map(msg =>
              msg.id === messageId ? { ...msg, eventType } : msg
            )
            messagesRef.current = updated
            return updated
          })
        }

        return
      }

      case 'error': {
        const errorMessage = typeof (event.data.message || event.data.error) === 'string'
          ? (event.data.message || event.data.error || 'An error occurred')
          : String(event.data.message || event.data.error || 'An error occurred')
        const isUiGenericError =
          !event.data.error_code &&
          /an error occurred/i.test(errorMessage)
        if (isUiGenericError) {
          const comfortText = "Don't worry, the testing is still running in the background. You can chill first, take a coffee. Any findings will be put in the report."
          showToast(comfortText, 'info', 7000)
          appendActivityStep(`Text: ${comfortText}`, event.data.agent_label as string | undefined)
          return
        }

        sendInProgressRef.current = false
        setIsLoading(false)
        // Keep currentStep so UI shows last real activity (e.g. "Running: dirsearch..."), not generic "Running tools..."
        streamingMessageRef.current = null
        const messageId = currentAssistantMessageIdRef.current || addAssistantMessage('error')
        appendActivityStep(`Error: ${errorMessage}`, event.data.agent_label as string | undefined)
        const isAborted =
          event.data.error_code === 'request_aborted' ||
          /\baborted\b|cancelled|canceled/i.test(errorMessage)
        const isContextTooLong =
          event.data.error_code === 'context_too_long' ||
          /conversation is too long|start a new chat/i.test(errorMessage)
        if (isAborted) {
          showToast('Request was cancelled before completion.', 'info', 4000)
        } else if (isContextTooLong) {
          showToast('Conversation is too long. Start a new chat to continue.', 'warning', 6000)
        }
        const displayContent = isAborted
          ? `Stopped: ${errorMessage}`
          : isContextTooLong
          ? `Error: ${errorMessage}\n\nTip: Start a new chat to continue — your previous messages won't be sent to the model.`
          : `Error: ${errorMessage}\n\nDon't worry, if the run is still active in the backend, findings will continue to be saved in the report.`
        setMessages(prev =>
          prev.map(message =>
            message.id === messageId
              ? { ...message, content: displayContent, eventType: 'error', isStreaming: false, done: true }
              : message
          )
        )
        if (currentConversationId) {
          setConversationRunStatus(prev => ({ ...prev, [currentConversationId]: 'error' }))
        }
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
        return
      }

      case 'done': {
        const hasAgentIndex = event.data.agent_index != null
        const isMainAgentDone = !hasAgentIndex || Number(event.data.agent_index) === 1
        if (!isMainAgentDone) {
          const subAgentLabel = (event.data.agent_label as string | undefined) || `Agent ${String(event.data.agent_index)}`
          appendActivityStep('Done', subAgentLabel)
          return
        }

        sendInProgressRef.current = false
        setIsLoading(false)
        setCurrentStep(null)
        appendActivityStep('Done')
        streamingMessageRef.current = null
        if (event.data.conversation_id) {
          const cid = event.data.conversation_id
          setCurrentConversationId(cid)
          setConversationRunStatus(prev => ({ ...prev, [cid]: 'finished' }))
          // Link current view to the conversation the agent used (fixes "spawn creates another conversation" confusion)
          setCurrentChatId(cid)
          refetchChatHistory()
        } else if (currentConversationId) {
          setConversationRunStatus(prev => ({ ...prev, [currentConversationId]: 'finished' }))
        }
        const messageId = currentAssistantMessageIdRef.current
        if (messageId) {
          markMessageDone(messageId)
        }
        if (event.data.report_path) {
          showToast('Scan completed! Report available.', 'success')
        }
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
        return
      }

      default:
        if (event.data.message) {
          const messageId = ensureAssistantForText()
          updateMessageContent(messageId, String(event.data.message || ''))
        }
        return
    }
  }


  const filteredChatHistory = chatHistory.filter(chat =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  if (!isAuthenticated) {
    return null
  }

  const planLabel = currentPlan?.plan?.name || currentPlan?.plan?.code || 'Free'

  const sidebarHeaderContent = (
    <>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img src={logo} alt="GwehAI" className="sidebar-logo-image" />
          <span className="logo-text">Gweh</span>
          <span className="logo-badge">[AI]</span>
        </div>
        {!isMobile && (
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed((c) => !c)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {sidebarCollapsed ? (
                <path d="M9 18l6-6-6-6" />
              ) : (
                <path d="M15 18l-6-6 6-6" />
              )}
            </svg>
          </button>
        )}
      </div>
      <nav className="sidebar-nav sidebar-nav-header">
        <button className="nav-item" onClick={handleNewChat} title="New Chat">
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </span>
          <span className="nav-text">New Chat</span>
        </button>
        <button className="nav-item" onClick={() => setShowSearch(!showSearch)} title="Search Chat">
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </span>
          <span className="nav-text">Search Chat</span>
        </button>
        <button className="nav-item" onClick={() => navigate('/agent/pentest-runner')} title="Pentest Job Runner">
          <span className="nav-icon">&#9876;</span>
          <span className="nav-text">Pentest Runner</span>
        </button>
        <button className="nav-item" onClick={() => setShowReportModal(true)} title="Security Reports">
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </span>
          <span className="nav-text">Report</span>
        </button>
        <button className="nav-item" onClick={() => setShowHacktivityModal(true)} title="Hacktivity">
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </span>
          <span className="nav-text">Hacktivity</span>
        </button>
        <button className="nav-item" onClick={() => setShowPlanModal(true)} title="Plan & Usage">
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </span>
          <span className="nav-text">Plan</span>
        </button>
        {showSearch && (
          <div className="sidebar-search">
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
              autoFocus
            />
          </div>
        )}
      </nav>
    </>
  )

  const sidebarListContent = (
    <>
      {/* Hide "YOUR CHATS" and list when sidebar is collapsed (desktop 72px) */}
      {(!sidebarCollapsed || isMobile) && (
        <>
          <div className="sidebar-divider" />
          <div className={`sidebar-chats-section ${chatsSectionCollapsed ? 'sidebar-chats-section--collapsed' : ''}`}>
            <button
              type="button"
              className="sidebar-section-header"
              onClick={() => setChatsSectionCollapsed((c) => !c)}
              aria-expanded={!chatsSectionCollapsed}
              aria-label={chatsSectionCollapsed ? 'Expand chat list' : 'Collapse chat list'}
              title={chatsSectionCollapsed ? 'Expand chat list' : 'Collapse chat list'}
            >
              <span className="section-title">YOUR CHATS</span>
              <span className="section-chevron" aria-hidden>▼</span>
            </button>
            <div className="chat-history-list">
            {filteredChatHistory.map((chat) => (
              <div
                key={chat.id}
                className={`chat-history-item ${currentChatId === chat.id ? 'active' : ''}`}
                onClick={() => {
                  if (editingChatId !== chat.id) {
                    handleLoadChat(chat.id)
                  }
                }}
              >
                {sidebarOpen ? (
                  <>
                    {editingChatId === chat.id ? (
                      <input
                        type="text"
                        className="chat-title-input"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => handleSaveRename(chat.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveRename(chat.id, e)
                          } else if (e.key === 'Escape') {
                            handleCancelRename()
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <span className="chat-title">{chat.title}</span>
                    )}
                    <div className="chat-menu-container">
                      <button
                        className="chat-menu-button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenMenuId(openMenuId === chat.id ? null : chat.id)
                        }}
                        title="More options"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="5" r="1"/>
                          <circle cx="12" cy="12" r="1"/>
                          <circle cx="12" cy="19" r="1"/>
                        </svg>
                      </button>
                      {openMenuId === chat.id && (
                        <div className="chat-menu-dropdown">
                          <button
                            className="chat-menu-item"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRenameChat(chat.id)
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                            Rename
                          </button>
                          <button
                            className="chat-menu-item delete"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteChat(chat.id)
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                            Delete chat
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="chat-icon-wrapper collapsed">
                    <svg className="chat-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                )}
              </div>
            ))}
            </div>
          </div>
        </>
      )}
    </>
  )

  const sidebarFooterContent = (
    <ProfileFooter
      name={user?.name || user?.email || 'User'}
      email={user?.email}
      planLabel={planLabel}
      collapsed={!isMobile && sidebarCollapsed}
      onUpgrade={() => setShowUpgradeModal(true)}
      onSettings={() => setShowSettingsModal(true)}
      onHelp={() => setShowHelpModal(true)}
      onLogout={handleLogout}
    />
  )

  return (
    <PageLoader>
      <div className="dashboard">
        <ToastContainer toasts={toasts} onClose={removeToast} />
        <DashboardLayout
          isSidebarOpen={sidebarOpen}
          onSidebarToggle={(open) => setSidebarOpen(open !== undefined ? open : !sidebarOpen)}
          isMobile={isMobile}
          sidebarCollapsed={sidebarCollapsed}
          chatCollapsed={chatCollapsed}
          onChatCollapseToggle={(collapsed) => setChatCollapsed(collapsed !== undefined ? collapsed : !chatCollapsed)}
          sidebarHeader={sidebarHeaderContent}
          sidebarList={sidebarListContent}
          sidebarFooter={sidebarFooterContent}
          mainContent={
            <>
              <main className="dashboard-chat">
                <ChatLayout
                  topContent={
                    messages.length === 0 ? (
                      <>
                        <div className="chat-logo-section">
                          <div className="chat-logo">
                            <img src={logo} alt="GwehAI" className="chat-logo-image" />
                          </div>
                          <h1 className="chat-logo-text">GwehAI</h1>
                        </div>
                        <div className="chat-empty-mobile">
                          <h2 className="chat-empty-prompt">What would you like to test today?</h2>
                          <div className="chat-suggestions">
                            <button type="button" className="chat-suggestion-btn" onClick={() => handleSendWithText('Run a pentest on a target URL and report findings')}>
                              <span className="chat-suggestion-icon chat-suggestion-icon-pentest">&#9876;</span>
                              <span>Run a pentest</span>
                            </button>
                            <button type="button" className="chat-suggestion-btn" onClick={() => handleSendWithText('Explain SQL injection and how to test for it')}>
                              <span className="chat-suggestion-icon chat-suggestion-icon-learn">&#128214;</span>
                              <span>Explain a vulnerability</span>
                            </button>
                            <button type="button" className="chat-suggestion-btn" onClick={() => handleSendWithText('Check this URL for security issues: https://example.com')}>
                              <span className="chat-suggestion-icon chat-suggestion-icon-check">&#128274;</span>
                              <span>Check a URL</span>
                            </button>
                            <button type="button" className="chat-suggestion-btn" onClick={() => handleSendWithText('Give me step-by-step security testing tips for a web app')}>
                              <span className="chat-suggestion-icon chat-suggestion-icon-tips">&#128161;</span>
                              <span>Security tips</span>
                            </button>
                          </div>
                        </div>
                      </>
                    ) : undefined
                  }
                  composer={
                    <Composer>
                      <div className="chat-input-area">
                        {isVoiceRecording ? (
                          <div className="voice-input-shell">
                            <div className="voice-input-container">
                              <div className="voice-wave-row">
                                <div className="voice-wave-line" />
                              </div>
                              <div className="voice-input-footer">
                                <div className="voice-status">
                                  <span className="voice-status-dot" />
                                  <span className="voice-status-text">
                                    {voiceTranscript ? 'Captured voice input' : 'Listening...'}
                                  </span>
                                </div>
                                <div className="voice-actions">
                                  <button type="button" className="voice-action-btn cancel" onClick={cancelVoiceInput}>✕</button>
                                  <button type="button" className="voice-action-btn confirm" onClick={confirmVoiceInput} disabled={!voiceTranscript.trim()}>✓</button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="input-container">
                            <button className="input-attach" type="button">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                              </svg>
                            </button>
                            <textarea
                              ref={inputRef}
                              className="chat-input"
                              value={input}
                              onChange={(e) => setInput(e.target.value)}
                              onKeyPress={handleKeyPress}
                              placeholder="Ask anything"
                              rows={1}
                              disabled={isLoading}
                            />
                            <div className="input-actions">
                              <button className="input-voice" type="button" onClick={startVoiceRecognition} title="Voice input">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                                  <line x1="12" y1="19" x2="12" y2="23" />
                                  <line x1="8" y1="23" x2="16" y2="23" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="input-send input-send--toggle"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={isLoading ? handleStopJob : handleSend}
                                disabled={!isLoading && !input.trim()}
                                title={isLoading ? 'Stop' : 'Send message'}
                              >
                                {isLoading ? (
                                  <span className="input-send-stop-label">Stop</span>
                                ) : (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13" />
                                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="chat-home-indicator" aria-hidden />
                    </Composer>
                  }
                >
                  <MessagesArea ref={messagesAreaRef} onNearBottomChange={(near) => { userNearBottomRef.current = near }}>
            {messages.length === 0 ? (
              <div className="chat-empty">
                <p className="empty-text">Start a conversation with GwehAI</p>
                <p className="empty-subtext">Ask security questions or request a pentest (e.g., "What is SQL injection?" or "pentest https://example.com")</p>
              </div>
            ) : (
              <div className="chat-messages">
                {messages
                  .filter((message) => {
                    // Always show user messages
                    if (message.role === 'user') return true
                    
                    // Show assistant placeholder states (Thinking..., Planning..., Executing...) so effect is visible
                    if (message.role === 'assistant' && (message.eventType === 'planning' || message.eventType === 'thinking' || message.eventType === 'executing' || message.eventType === 'planning-next')) {
                      return true
                    }
                    
                    // Show assistant messages with meaningful content or thinking
                    const content = String(message.content || '').trim()
                    const hasThinking = String(message.thinking || '').trim().length > 0
                    if (!content && !hasThinking) return false
                    
                    // Filter out invalid content
                    if (content === '0' || content === 'false' || content === 'undefined' || content === 'null') {
                      return false
                    }
                    // Show messages with content, thinking, or tools (so tool-running state is visible)
                    const hasTools = (messageToolsSnapshot[message.id]?.length ?? 0) > 0
                    return content.length > 0 || hasThinking || (message.role === 'assistant' && hasTools)
                  })
                  .map((message) => {
                  const toolState = messageToolState[message.id]
                  const fullThinking = String(message.thinking || '')
                  const thinkingLen = fullThinking.length
                  const thinkingDisplayLen = (message.thinkingDisplay?.length ?? 0)
                  const hasThinking = thinkingLen > 0
                  const thinkingFinished = !hasThinking || thinkingDisplayLen >= thinkingLen
                  const canShowFinalContent = thinkingFinished
                  const showThinkingBlock = hasThinking && !canShowFinalContent

                  const isStreamingThisMessage = message.role === 'assistant' && message.isStreaming
                  return (
                  <div key={message.id} className={`chat-message ${message.role} ${message.eventType ? `event-${message.eventType}` : ''}`}>
                    <div className="message-content">
                      <div className="message-bubble">
                        <div className="message-text">
                        {/* ChatGPT-style thinking bar above assistant output when streaming */}
                        {message.role === 'assistant' && (isStreamingThisMessage || (isLoading && !message.content)) && (
                          <>
                            <ThinkingBar
                              currentStep={currentStep}
                              steps={activityLog}
                              isStreaming={isStreamingThisMessage || isLoading}
                              checklistProgress={pentestChecklistProgress}
                            />
                            {logEvents.length > 0 && (
                              <GwehLogRenderer events={logEvents} compact copyableBlocks className="chat-gweh-log" />
                            )}
                          </>
                        )}
                        {message.eventType === 'planning' && !message.content ? null : message.eventType === 'thinking' && !message.content ? null : (
                          <>
                            {message.role === 'assistant' && showThinkingBlock && (
                              <div className="message-thinking chat-thinking">
                                <div className="message-thinking-label">Thinking</div>
                                <div
                                  className={`message-thinking-content${(message.thinkingDisplay?.length ?? 0) < (message.thinking?.length ?? 0) ? ' streaming' : ''}`}
                                >
                                  <MarkdownMessage
                                    content={message.thinkingDisplay !== undefined ? message.thinkingDisplay : (message.thinking ?? '')}
                                    isStreaming={false}
                                  />
                                </div>
                              </div>
                            )}
                            {message.content && canShowFinalContent ? (
                              <>
                                {message.role === 'assistant' ? (
                                  <MarkdownMessage 
                                    content={
                                      !message.done && message.contentDisplay !== undefined
                                        ? message.contentDisplay
                                        : typeof message.content === 'string'
                                          ? message.content
                                          : message.content
                                            ? String(message.content)
                                            : ''
                                    }
                                    isStreaming={message.isStreaming && !!message.content}
                                  />
                                ) : (
                                  <span className="message-content-text">
                                    {typeof message.content === 'string' 
                                      ? message.content 
                                      : message.content 
                                        ? String(message.content) 
                                        : ''}
                                  </span>
                                )}
                                {message.role === 'assistant' && (() => {
                                  if (toolState?.toolsComplete && toolState.hasTools) {
                                    return (
                                      <div className="assistant-loading">
                                        Planning next plan
                                        <span className="loading-dots">
                                          <span></span><span></span><span></span>
                                        </span>
                                      </div>
                                    )
                                  }
                                  if (!toolState?.toolsComplete && toolState?.activeTools && toolState.activeTools > 0) {
                                    return (
                                      <div className="assistant-loading">
                                        {currentStep || (isLoading ? 'Running tools...' : '')}
                                        <span className="loading-dots">
                                          <span></span><span></span><span></span>
                                        </span>
                                      </div>
                                    )
                                  }
                                  if (message.isStreaming && isLoading) {
                                    return (
                                      <div className="assistant-loading">
                                        {currentStep || 'Working...'}
                                        <span className="loading-dots">
                                          <span></span><span></span><span></span>
                                        </span>
                                      </div>
                                    )
                                  }
                                  return null
                                })()}
                              </>
                            ) : null}
                          </>
                        )}
                        </div>
                      </div>
                      {!message.isStreaming && (
                        <div className="message-time">
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  </div>
                )})}
                {isLoading && !messages.some((m) => m.role === 'assistant' && m.isStreaming) && (
                  <div className="chat-message assistant chat-loading-dots" aria-hidden>
                    <div className="message-content">
                      <div className="message-bubble">
                        <ThinkingBar currentStep={currentStep} steps={activityLog} isStreaming checklistProgress={pentestChecklistProgress} />
                        {logEvents.length > 0 && (
                          <GwehLogRenderer events={logEvents} compact copyableBlocks className="chat-gweh-log" />
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {/* Show checklist bar for pentest chats when not streaming so user can expand to see progress */}
                {!isLoading && pentestChecklistProgress && (
                  <div className="chat-message assistant" aria-hidden>
                    <div className="message-content">
                      <div className="message-bubble">
                        <ThinkingBar currentStep={null} steps={activityLog} isStreaming={false} checklistProgress={pentestChecklistProgress} />
                        {logEvents.length > 0 && (
                          <GwehLogRenderer events={logEvents} compact copyableBlocks className="chat-gweh-log" />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
                  </MessagesArea>
                </ChatLayout>
              </main>
            </>
          }
        />

      {/* Upgrade Plan Modal */}
      {showUpgradeModal && (
        <div className="modal-overlay" onClick={() => setShowUpgradeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Upgrade Plan</h2>
              <button className="modal-close" onClick={() => setShowUpgradeModal(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="upgrade-plans-grid">
                {[
                  { points: 100, price: 20, name: 'Starter Pack' },
                  { points: 200, price: 35, name: 'Pro Pack', save: 5 },
                  { points: 500, price: 70, name: 'Expert Pack', save: 30, popular: true },
                  { points: 600, price: 100, name: 'Elite Pack', save: 20 },
                ].map((pack, index) => (
                  <div key={index} className={`upgrade-plan-card ${pack.popular ? 'popular' : ''}`}>
                    {pack.popular && <div className="popular-badge">Most Popular</div>}
                    <div className="plan-header">
                      <h3>{pack.name}</h3>
                      {pack.save && <div className="save-badge">Save ${pack.save}</div>}
                    </div>
                    <div className="plan-price">
                      <span className="price">${pack.price}</span>
                      <span className="points">for {pack.points} points</span>
                      <span className="price-per-point">${(pack.price / pack.points).toFixed(2)} per point</span>
                    </div>
                    <button className="plan-button" onClick={() => {
                      showToast(`Redirecting to purchase ${pack.points} points for $${pack.price}...`, 'info')
                      setShowUpgradeModal(false)
                    }}>
                      Buy Now
                    </button>
                  </div>
                ))}
                <div className="upgrade-plan-card enterprise">
                  <div className="plan-header">
                    <h3>Enterprise</h3>
                  </div>
                  <div className="plan-price">
                    <span className="price">Custom</span>
                    <span className="points">Tailored to your needs</span>
                  </div>
                  <ul className="enterprise-features">
                    <li>Volume Discounts</li>
                    <li>Dedicated Support</li>
                    <li>Custom Integrations</li>
                  </ul>
                  <button className="plan-button" onClick={() => {
                    window.location.href = '/contact'
                    setShowUpgradeModal(false)
                  }}>
                    Contact Us
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        settingsData={settingsData}
        onSettingsDataChange={(data) => setSettingsData((prev) => ({ ...prev, ...data }))}
        onSave={handleSaveSettings}
        isSaving={isSavingSettings}
        user={user}
        languageOptions={[
          { value: 'en', label: 'English' },
          { value: 'es', label: 'Spanish' },
          { value: 'fr', label: 'French' },
          { value: 'de', label: 'German' },
          { value: 'ja', label: 'Japanese' },
        ]}
        modelOptions={availableModels.map((model) => ({
          value: model.id,
          label: model.displayName || model.name || model.id,
          icon: getModelIcon(model.provider || '', model.name || model.displayName),
          tag: isProModel(model.name || model.displayName) ? 'Pro' : undefined,
        }))}
        emailReadOnly={!!(user as any)?.googleId}
      />

      {/* Help Modal */}
      {showHelpModal && (
        <div className="modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="modal-content help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Help & Support</h2>
              <button className="modal-close" onClick={() => setShowHelpModal(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-body help-modal-body">
              <div className="help-chat-container">
                <div className="help-messages">
                  {helpMessages.length === 0 ? (
                    <div className="help-empty">
                      <p>How can I help you today?</p>
                    </div>
                  ) : (
                    helpMessages.map((msg, idx) => (
                      <div key={idx} className={`help-message ${msg.role}`}>
                        <div className="help-message-content">{msg.content}</div>
                      </div>
                    ))
                  )}
                  {isHelpLoading && (
                    <div className="help-message assistant">
                      <div className="help-message-content">
                        <span className="typing-indicator">
                          <span></span><span></span><span></span>
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={helpMessagesEndRef} />
                </div>
                <div className="help-input-container">
                  <input
                    type="text"
                    className="help-input"
                    value={helpInput}
                    onChange={(e) => setHelpInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !isHelpLoading && helpInput.trim()) {
                        handleHelpSend()
                      }
                    }}
                    placeholder="Ask a question..."
                  />
                  <button
                    className="help-send-button"
                    onClick={handleHelpSend}
                    disabled={isHelpLoading || !helpInput.trim()}
                  >
                    {isHelpLoading ? '...' : '>'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div className="modal-overlay" onClick={closeReportModal}>
          <div className="modal-content report-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {reportDetailConversationId ? 'Findings for this report' : 'Security Reports'}
              </h2>
              <div className="modal-header-actions">
                {reportDetailConversationId && (
                  <button
                    type="button"
                    className="report-back-btn"
                    onClick={() => {
                      setReportDetailConversationId(null)
                      setReportFindings([])
                      setSelectedFindingId(null)
                      setSelectedFinding(null)
                    }}
                  >
                    ← Back
                  </button>
                )}
                <button className="modal-close" onClick={closeReportModal}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
            <div className="modal-body">
              {!reportDetailConversationId ? (
                <div className="report-table-container">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Conversation ID</th>
                        <th>Website</th>
                        <th>Findings</th>
                        <th>Start time</th>
                        <th>End time</th>
                        <th>Duration</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoadingReports ? (
                        <tr>
                          <td colSpan={8} className="report-loading-cell">
                            Loading reports...
                          </td>
                        </tr>
                      ) : reports.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="report-empty-cell">
                            No reports yet. Run a pentest to see findings here.
                          </td>
                        </tr>
                      ) : (
                        reports.flatMap((report) => {
                          const agents = (report as ReportTreeRow).agents ?? []
                          const hasChildren = agents.length > 1
                          const expanded = expandedReportIds.has(report.conversationId)
                          const toggleExpand = () => {
                            setExpandedReportIds((prev) => {
                              const next = new Set(prev)
                              if (next.has(report.conversationId)) next.delete(report.conversationId)
                              else next.add(report.conversationId)
                              return next
                            })
                          }
                          const runRow = (
                            <tr key={report.conversationId} className="report-run-row">
                              <td className="report-conversation-id" title={report.conversationId}>
                                {hasChildren ? (
                                  <button
                                    type="button"
                                    className="report-expand-btn"
                                    onClick={(e) => { e.stopPropagation(); toggleExpand() }}
                                    aria-expanded={expanded}
                                    title={expanded ? 'Collapse' : 'Expand'}
                                  >
                                    <span className={`report-chevron ${expanded ? 'expanded' : ''}`}>▸</span>
                                  </button>
                                ) : null}
                                <span className={hasChildren ? 'report-id-with-expand' : ''}>
                                  {report.conversationId.slice(0, 8)}…
                                </span>
                              </td>
                              <td className="target">{report.website}</td>
                              <td className="report-findings-count">{report.findingsCount}</td>
                              <td className="report-time">{formatReportTime(report.startedAt)}</td>
                              <td className="report-time">{formatReportTime(report.finishedAt)}</td>
                              <td className="report-duration">{formatReportDuration(report.startedAt, report.finishedAt)}</td>
                              <td>
                                {(() => {
                                  const status = (conversationRunStatus[report.conversationId] || String(report.runStatus || 'finished').toLowerCase() || 'finished') as string
                                  const tone = status === 'running'
                                    ? 'info'
                                    : status === 'error'
                                      ? 'high'
                                      : status === 'stopped'
                                        ? 'info'
                                        : 'low'
                                  return (
                                    <span className={`severity-badge severity-${tone}`}>
                                      {String(status).toUpperCase()}
                                    </span>
                                  )
                                })()}
                              </td>
                              <td className="report-actions">
                                <button
                                  type="button"
                                  className="report-detail-btn"
                                  onClick={() => {
                                    setReportDetailConversationId(report.conversationId)
                                    loadFindingsForConversation(report.conversationId)
                                  }}
                                >
                                  Detail
                                </button>
                              </td>
                            </tr>
                          )
                          const agentRows = expanded && hasChildren
                            ? agents.map((agent) => (
                                <tr key={agent.conversationId} className="report-agent-row">
                                  <td className="report-conversation-id report-agent-cell" title={agent.conversationId}>
                                    <span className="report-agent-indent">└</span>
                                    <span title={agent.conversationId}>{agent.conversationId.slice(0, 8)}…</span>
                                    <span className="report-agent-role">
                                      {agent.agentRole ? ` (${agent.agentRole})` : ''}
                                    </span>
                                  </td>
                                  <td className="target">—</td>
                                  <td className="report-findings-count">{agent.findingsCount}</td>
                                  <td className="report-time">—</td>
                                  <td className="report-time">—</td>
                                  <td className="report-duration">—</td>
                                  <td>—</td>
                                  <td className="report-actions"></td>
                                </tr>
                              ))
                            : []
                          return [runRow, ...agentRows]
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="report-findings-container">
                  {reportFindingsLoading ? (
                    <div className="report-loading-cell">Loading findings...</div>
                  ) : reportFindings.length === 0 ? (
                    <div className="report-empty-cell">No findings for this report.</div>
                  ) : (
                    <table className="report-table report-findings-table">
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Severity</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportFindings.map((finding) => (
                          <tr key={finding.id}>
                            <td className="finding-title">
                              {(finding.metadata as any)?.title || 'Finding'}
                            </td>
                            <td className="finding-severity">
                              <span className={`severity-badge severity-${((finding.metadata as any)?.severity || 'info').toLowerCase()}`}>
                                {(finding.metadata as any)?.severity || '—'}
                              </span>
                            </td>
                            <td className="report-actions">
                              <button
                                type="button"
                                className="report-detail-btn"
                                onClick={() => {
                                  setSelectedFindingId(finding.id)
                                  loadFindingDetail(finding.id)
                                }}
                              >
                                Detail
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Finding detail (POC) modal */}
      {showReportModal && selectedFinding && (
        <div className="modal-overlay" onClick={() => { setSelectedFindingId(null); setSelectedFinding(null) }}>
          <div className="modal-content report-poc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {(selectedFinding.metadata as any)?.title || 'Finding detail'}
              </h2>
              <button
                className="modal-close"
                onClick={() => { setSelectedFindingId(null); setSelectedFinding(null) }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-body report-poc-body">
              {selectedFinding.target && (
                <p className="report-poc-target"><strong>Target:</strong> {selectedFinding.target}</p>
              )}
              {(selectedFinding.metadata as any)?.severity && (
                <p className="report-poc-severity">
                  <strong>Severity:</strong>{' '}
                  <span className={`severity-badge severity-${((selectedFinding.metadata as any).severity || '').toLowerCase()}`}>
                    {(selectedFinding.metadata as any).severity}
                  </span>
                </p>
              )}
              {selectedFinding.detail && (
                <section className="report-poc-section">
                  <h3>Description</h3>
                  <pre className="report-poc-detail">{selectedFinding.detail}</pre>
                </section>
              )}
              {selectedFinding.poc && (
                <section className="report-poc-section">
                  <h3>Proof of Concept (POC)</h3>
                  <pre className="report-poc-poc">{selectedFinding.poc}</pre>
                </section>
              )}
              {!selectedFinding.detail && !selectedFinding.poc && (
                <p className="report-poc-empty">No description or POC saved for this finding.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hacktivity Modal */}
      {showHacktivityModal && (
        <div className="modal-overlay" onClick={closeHacktivityModal}>
          <div className="modal-content report-modal hacktivity-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {selectedHacktivity ? 'AI action detail' : 'Hacktivity'}
              </h2>
              <div className="modal-header-actions">
                {selectedHacktivity && (
                  <button
                    type="button"
                    className="report-back-btn"
                    onClick={() => {
                      setSelectedHacktivityId(null)
                      setSelectedHacktivity(null)
                    }}
                  >
                    ← Back
                  </button>
                )}
                <button className="modal-close" onClick={closeHacktivityModal}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
            <div className="modal-body">
              {selectedHacktivity ? (
                <div className="hacktivity-detail">
                  {selectedHacktivity.domain && (
                    <p className="hacktivity-detail-row"><strong>Domain:</strong> {selectedHacktivity.domain}</p>
                  )}
                  {selectedHacktivity.conversationId && (
                    <p className="hacktivity-detail-row"><strong>Conversation:</strong> <code>{selectedHacktivity.conversationId.slice(0, 8)}…</code></p>
                  )}
                  <p className="hacktivity-detail-row"><strong>Time:</strong> {formatReportTime(selectedHacktivity.createdAt)}</p>
                  {selectedHacktivity.toolArgs && Object.keys(selectedHacktivity.toolArgs).length > 0 && (
                    <section className="hacktivity-detail-section">
                      <h3>Arguments</h3>
                      <pre className="hacktivity-detail-pre">{JSON.stringify(selectedHacktivity.toolArgs, null, 2)}</pre>
                    </section>
                  )}
                  {selectedHacktivity.result != null && (
                    <section className="hacktivity-detail-section">
                      <h3>Result</h3>
                      <pre className="hacktivity-detail-pre hacktivity-detail-result">{selectedHacktivity.result}</pre>
                    </section>
                  )}
                </div>
              ) : (
                <>
                  <div className="hacktivity-toolbar">
                    <label className="hacktivity-filter-label">
                      Conversation:
                      <select
                        className="hacktivity-filter-select"
                        value={selectedHacktivityConversationId ?? ''}
                        onChange={(e) => {
                          const id = e.target.value || null
                          setSelectedHacktivityConversationId(id)
                          setHacktivityPage(1)
                          loadHacktivity(1, id)
                        }}
                      >
                        <option value="">All conversations</option>
                        {hacktivityConversations.map((c) => (
                          <option key={c.conversationId} value={c.conversationId}>
                            {c.title || c.conversationId.slice(0, 8) + '…'} ({c.count})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="report-table-container">
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Conversation</th>
                          <th>Domain</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {isLoadingHacktivity ? (
                          <tr>
                            <td colSpan={4} className="report-loading-cell">Loading activity...</td>
                          </tr>
                        ) : hacktivityList.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="report-empty-cell">No AI activity yet. Run a pentest or chat to see actions here.</td>
                          </tr>
                        ) : (
                          hacktivityList.map((row) => (
                            <tr
                              key={row.id}
                              className="hacktivity-row"
                              onClick={() => loadHacktivityDetail(row.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => e.key === 'Enter' && loadHacktivityDetail(row.id)}
                            >
                              <td className="report-time">{formatReportTime(row.createdAt)}</td>
                              <td className="report-conversation-id" title={row.conversationId ?? ''}>
                                {row.conversationId ? `${row.conversationId.slice(0, 8)}…` : '—'}
                              </td>
                              <td className="hacktivity-domain" title={row.domain ?? ''}>
                                {row.domain ? (row.domain.length > 32 ? `${row.domain.slice(0, 32)}…` : row.domain) : '—'}
                              </td>
                              <td className="report-actions">
                                <button type="button" className="report-detail-btn" onClick={(e) => { e.stopPropagation(); loadHacktivityDetail(row.id) }}>Detail</button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {hacktivityTotal > 0 && (
                    <div className="hacktivity-pagination">
                      <span className="hacktivity-pagination-info">
                        Page {hacktivityPage} of {hacktivityTotalPages} ({hacktivityTotal} total)
                      </span>
                      <div className="hacktivity-pagination-buttons">
                        <button
                          type="button"
                          className="report-detail-btn"
                          disabled={hacktivityPage <= 1 || isLoadingHacktivity}
                          onClick={() => {
                            const prev = hacktivityPage - 1
                            setHacktivityPage(prev)
                            loadHacktivity(prev, selectedHacktivityConversationId)
                          }}
                        >
                          ← Prev
                        </button>
                        <button
                          type="button"
                          className="report-detail-btn"
                          disabled={hacktivityPage >= hacktivityTotalPages || isLoadingHacktivity}
                          onClick={() => {
                            const next = hacktivityPage + 1
                            setHacktivityPage(next)
                            loadHacktivity(next, selectedHacktivityConversationId)
                          }}
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Plan Modal */}
      {showPlanModal && (
        <div className="modal-overlay" onClick={() => setShowPlanModal(false)}>
          <div className="modal-content plan-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">My Plan & Usage</h2>
              <button className="modal-close" onClick={() => setShowPlanModal(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="plan-info-section">
                <h3 className="plan-section-title">Current Plan</h3>
                {isLoadingPlan ? (
                  <div className="plan-card">
                    <div className="plan-loading">Loading plan...</div>
                  </div>
                ) : !currentPlan ? (
                  <div className="plan-card">
                    <div className="plan-card-header">
                      <span className="plan-name">No active plan</span>
                    </div>
                    <div className="plan-details">
                      <div className="plan-detail-item">
                        <span className="detail-label">Status:</span>
                        <span className="detail-value">You are currently on the free tier.</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="plan-card">
                    <div className="plan-card-header">
                      <span className="plan-name">{currentPlan.plan?.name || currentPlan.plan?.code || 'Custom Plan'}</span>
                      <span className="plan-badge">{currentPlan.status.toUpperCase()}</span>
                    </div>
                    <div className="plan-details">
                      <div className="plan-detail-item">
                        <span className="detail-label">Points:</span>
                        <span className="detail-value">
                          {currentPlan.pointsGranted} total
                        </span>
                      </div>
                      <div className="plan-detail-item">
                        <span className="detail-label">Price:</span>
                        <span className="detail-value">
                          {currentPlan.plan?.monthlyPriceUsd != null
                            ? `$${currentPlan.plan.monthlyPriceUsd}`
                            : 'Custom'}
                        </span>
                      </div>
                      <div className="plan-detail-item">
                        <span className="detail-label">Status:</span>
                        <span className={`detail-value ${currentPlan.status === 'active' ? 'active' : ''}`}>
                          {currentPlan.status}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="usage-section">
                <h3 className="plan-section-title">Usage Statistics</h3>
                <div className="usage-stats">
                  <div className="usage-stat-card">
                    <div className="stat-label">Wallet Points</div>
                    <div className="stat-value">
                      {pointsBalance != null ? pointsBalance : '—'}
                    </div>
                  </div>
                  <div className="usage-stat-card">
                    <div className="stat-label">Points Used</div>
                    <div className="stat-value">
                      {currentPlan
                        ? `${currentPlan.pointsUsed} / ${currentPlan.pointsGranted || currentPlan.pointsUsed}`
                        : '0 / 0'}
                    </div>
                    <div className="stat-progress">
                      <div
                        className="stat-progress-bar"
                        style={{
                          width: currentPlan && currentPlan.pointsGranted
                            ? `${Math.min(
                                100,
                                Math.round(
                                  (currentPlan.pointsUsed / currentPlan.pointsGranted) * 100,
                                ),
                              )}%`
                            : '0%',
                        }}
                      ></div>
                    </div>
                    <div className="stat-percentage">
                      {currentPlan && currentPlan.pointsGranted
                        ? `${Math.min(
                            100,
                            Math.round(
                              (currentPlan.pointsUsed / currentPlan.pointsGranted) * 100,
                            ),
                          )}%`
                        : '0%'}
                    </div>
                  </div>
                  <div className="usage-stat-card">
                    <div className="stat-label">Points Remaining</div>
                    <div className="stat-value">
                      {currentPlan && currentPlan.pointsGranted
                        ? Math.max(currentPlan.pointsGranted - currentPlan.pointsUsed, 0)
                        : 0}
                    </div>
                  </div>
                  <div className="usage-stat-card">
                    <div className="stat-label">Total Messages</div>
                    <div className="stat-value">
                      {currentPlan ? currentPlan.messagesSent : 0}
                    </div>
                  </div>
                  <div className="usage-stat-card">
                    <div className="stat-label">Reports Generated</div>
                    <div className="stat-value">
                      {currentPlan ? currentPlan.reportsGenerated : 0}
                    </div>
                  </div>
                </div>
              </div>

              <div className="plan-actions">
                <button className="upgrade-plan-button" onClick={() => {
                  setShowPlanModal(false)
                  setShowUpgradeModal(true)
                }}>
                  Upgrade Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      </div>
    </PageLoader>
  )
}

export default Dashboard
