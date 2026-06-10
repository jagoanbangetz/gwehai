import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { logo } from '../assets/images'
import './Dashboard.css'
import './Dashboard.builder.css'
import apiClient from '../utils/api'
import { ToastContainer, Toast } from '../components/Toast'
import { gwehaiClient, GwehAIEvent } from '../utils/gwehaiApi'
import DashboardLayout from '../components/DashboardLayout'
import ProfileFooter from '../components/ProfileFooter'
import SettingsModal from '../components/SettingsModal'
import MessagesArea, { type MessagesAreaRef } from '../components/MessagesArea'
import ChatLayout from '../components/ChatLayout'
import { getStoredModelKey, setStoredModelKey, getStoredModelId, type ModelKey } from '../components/ModelPicker'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { PLAN_TIERS } from '../config/plans'
import type { Message, Tool, ToolState, ChatHistory } from './dashboard/types'
import { isConversationUuid, conversationToChatHistory } from './dashboard/utils'
import { makeAssistantMessage, makeUserMessage, makeErrorMessage, createMessageId } from './dashboard/messageOps'
import { handleStreamEvent, type StreamHandlerContext } from './dashboard/streamHandler'
import { useVoiceRecognition } from './dashboard/hooks/useVoiceRecognition'
import { useDashboardData } from './dashboard/hooks/useDashboardData'
import { useOnboardingTour } from '../hooks/useOnboardingTour'
import '../styles/onboarding.css'
import UpgradeModal from './dashboard/modals/UpgradeModal'
import HelpModal from './dashboard/modals/HelpModal'
import ReportModal from './dashboard/modals/ReportModal'
import HacktivityModal from './dashboard/modals/HacktivityModal'
import PlanModal from './dashboard/modals/PlanModal'
import CurrentPentestModal from './dashboard/modals/CurrentPentestModal'
import ChatSidebar from './dashboard/components/ChatSidebar'
import SidebarHeader from './dashboard/components/DashboardSidebar'
import ChatMessages from './dashboard/components/ChatMessages'
import ChatComposer from './dashboard/components/ChatComposer'

const ACTIVE_JOB_STORAGE_KEY = 'gwehai_current_pentest_job_id'

const Dashboard = () => {
  const { user, isAuthenticated, logout, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isMobile = useMediaQuery('(max-width: 1023px)')

  // ─── Toast ───
  const [toasts, setToasts] = useState<Toast[]>([])
  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration = 3000) => {
    setToasts((prev) => [...prev, { id: Date.now().toString() + Math.random().toString(36).substr(2, 9), message, type, duration }])
  }
  const removeToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id))

  // ─── Data hook ───
  const data = useDashboardData(showToast)

  // ─── Onboarding Tour ───
  const tour = useOnboardingTour({
    scanCount: data.myPlan?.scan_limit?.sessions_started_today ?? 0,
    isAdmin: user?.role === 'admin',
    isLoading: !data.myPlan,
  })

  // ─── Core state ───
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [selectedModelKey, setSelectedModelKey] = useState<ModelKey>(() => getStoredModelKey())
  const [selectedModelId, setSelectedModelId] = useState<string | null>(() => getStoredModelId())
  const [chatMode, setChatMode] = useState<'agent' | 'ask'>(() => {
    try { const raw = localStorage.getItem('gwehai_chat_mode'); if (raw === 'agent' || raw === 'ask') return raw } catch (_) {} return 'ask'
  })
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
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [showCurrentPentestModal, setShowCurrentPentestModal] = useState(false)
  const [currentPentestJobs, _setCurrentPentestJobs] = useState<Array<{ job_id: string; status: string; user_message?: string; conversation_id?: string; phase_display?: string; current_section_display?: string | null; checklist?: Record<string, boolean>; last_action_summary?: string | null; createdAt?: number }>>([])
  const [currentPentestLoading, _setCurrentPentestLoading] = useState(false)
  const [currentPentestError, _setCurrentPentestError] = useState<string | null>(null)
  const [helpMessages, setHelpMessages] = useState<Message[]>([])
  const [helpInput, setHelpInput] = useState('')
  const [isHelpLoading, setIsHelpLoading] = useState(false)
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [_conversationRunStatus, setConversationRunStatus] = useState<Record<string, 'running' | 'finished' | 'error' | 'stopped'>>({})
  const [tools, setTools] = useState<Record<string, Tool>>({})
  const [messageTools, setMessageTools] = useState<Record<string, string[]>>({})
  const [messageToolState, setMessageToolState] = useState<Record<string, ToolState>>({})
  const [currentAssistantMessageId, setCurrentAssistantMessageId] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<string | null>(null)
  const [activityLog, setActivityLog] = useState<string[]>([])
  const [logEvents, setLogEvents] = useState<import('../components/GwehLog').LogEvent[]>([])
  const [isSimpleConversation, setIsSimpleConversation] = useState(false)
  const [pentestChecklistProgress, setPentestChecklistProgress] = useState<{ phase: string; phase_display?: string; current_section_display?: string | null; checklist: Record<string, boolean> } | null>(null)

  // ─── Refs ───
  const messageToolsSnapshot = useMemo(() => messageTools, [messageTools])
  const messagesAreaRef = useRef<MessagesAreaRef | null>(null)
  const userNearBottomRef = useRef(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const helpMessagesEndRef = useRef<HTMLDivElement>(null)
  const streamingMessageRef = useRef<number | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
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
  const stopRequestedRef = useRef(false)
  const intentionalCloseRef = useRef(false)
  const hacktivityPollRef = useRef({ page: 1, conversationId: null as string | null })
  const hasShownAuthToastRef = useRef(false)

  // ─── Voice ───
  const voice = useVoiceRecognition(setInput, inputRef)

  // ─── Chat helpers ───
  const refetchChatHistory = async () => {
    if (!user?.id) return
    try {
      const res = await apiClient.get<Array<{ id: string; title?: string | null; messages?: Array<{ id: string; role: string; content?: string | null; createdAt: string }>; createdAt: string; updatedAt: string; pentestJobId?: string | null }>>('/chat/conversations')
      const list = Array.isArray(res.data) ? res.data : (res as any).data?.conversations || []
      setChatHistory(list.map((c: unknown) => conversationToChatHistory(c as Parameters<typeof conversationToChatHistory>[0])))
    } catch (e) { console.warn('Refetch chat history:', e) }
  }

  const handleNewChat = () => {
    // Set intentional close BEFORE closing EventSource so onerror handler skips reconnect
    intentionalCloseRef.current = true
    stopRequestedRef.current = true
    if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null }
    pentestJobStreamAbortRef.current?.abort(); pentestJobStreamAbortRef.current = null
    setSearchParams({}); setMessages([]); setCurrentChatId(null); setCurrentConversationId(null); setCurrentJobId(null)
    try { localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY) } catch (_) {}
    setPentestChecklistProgress(null); setTools({}); setMessageTools({}); setMessageToolState({})
    setCurrentAssistantMessageId(null); streamingMessageRef.current = null; setIsLoading(false)
    // Reset agent mode context — prevent leaking state into new chat
    setIsSimpleConversation(false); setCurrentStep(null); setActivityLog([]); setLogEvents([])
    sendInProgressRef.current = false
    currentAssistantMessageIdRef.current = null
    lastCompletedAssistantMessageIdRef.current = null
    pendingAssistantMessageIdRef.current = null
    lastReasoningFromBackendRef.current = null
    streamMessageMapRef.current = {}
    messagesRef.current = []
    inputRef.current?.focus(); if (isMobile) setSidebarOpen(false)
  }

  const handleLoadChat = async (chatId: string) => {
    intentionalCloseRef.current = false
    if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null }
    setSearchParams({ session_id: chatId }); setCurrentChatId(chatId); setCurrentConversationId(chatId); setCurrentJobId(null)
    try { localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY) } catch (_) {}
    setMessageTools({}); setMessageToolState({}); setCurrentAssistantMessageId(null)
    streamingMessageRef.current = null; setIsLoading(false)
    if (isConversationUuid(chatId)) {
      try {
        const { data: conv } = await apiClient.get(`/chat/conversations/${chatId}`)
        if (conv) { const chat = conversationToChatHistory(conv); const local = chatHistory.find((c) => c.id === chatId); setMessages(local && (local.messages.length > chat.messages.length) ? local.messages : chat.messages) }
      } catch (e) { console.warn('Could not load conversation:', chatId, e); const chat = chatHistory.find((c) => c.id === chatId); if (chat) setMessages(chat.messages) }
    } else { const chat = chatHistory.find((c) => c.id === chatId); if (chat) setMessages(chat.messages) }
    if (isMobile) setSidebarOpen(false)
  }

  const handleDeleteChat = async (chatId: string) => {
    if (isConversationUuid(chatId)) { try { await apiClient.delete(`/chat/conversations/${chatId}`) } catch (e) { console.warn('Delete:', e) } }
    const updated = chatHistory.filter((c) => c.id !== chatId); setChatHistory(updated)
    localStorage.setItem(`gwehai_chat_history_${user?.id}`, JSON.stringify(updated))
    if (currentChatId === chatId) { setMessages([]); setCurrentChatId(null); setCurrentConversationId(null) }
    setOpenMenuId(null)
  }

  const handleRenameChat = (chatId: string) => { const chat = chatHistory.find((c) => c.id === chatId); if (chat) { setEditingChatId(chatId); setEditTitle(chat.title); setOpenMenuId(null) } }
  const handleSaveRename = (chatId: string, e?: React.KeyboardEvent) => { if (e && e.key !== 'Enter') return; if (!editTitle.trim()) { handleCancelRename(); return }; setChatHistory(chatHistory.map((c) => (c.id === chatId ? { ...c, title: editTitle.trim() } : c))); setEditingChatId(null); setEditTitle('') }
  const handleCancelRename = () => { setEditingChatId(null); setEditTitle('') }

  const handleHelpSend = async () => {
    if (!helpInput.trim() || isHelpLoading) return
    setHelpMessages((prev) => [...prev, { id: createMessageId(), role: 'user', content: helpInput, timestamp: new Date() }])
    setHelpInput(''); setIsHelpLoading(true)
    try {
      const res = await apiClient.post('/chat', { message: helpInput, conversation: [] })
      setHelpMessages((prev) => [...prev, { id: createMessageId(), role: 'assistant', content: res.data.response || res.data.message?.content || "I'm here to help!", timestamp: new Date() }])
    } catch (error) { console.error('Help chat error:', error); setHelpMessages((prev) => [...prev, { id: createMessageId(), role: 'assistant', content: 'I encountered an error. Please try again.', timestamp: new Date() }]) }
    finally { setIsHelpLoading(false) }
  }

  // ─── Stream context ───
  const streamCtx: StreamHandlerContext = useMemo(() => ({
    stopRequestedRef, currentAssistantMessageIdRef, messagesRef, messageToolStateRef, toolsRef,
    lastCompletedAssistantMessageIdRef, pendingAssistantMessageIdRef, lastReasoningFromBackendRef,
    streamMessageMapRef, streamingMessageRef, sendInProgressRef, eventSourceRef, intentionalCloseRef,
    setMessages, setTools, setMessageTools, setMessageToolState, setCurrentAssistantMessageId,
    setCurrentStep, setActivityLog, setLogEvents, setIsLoading, setIsSimpleConversation,
    setConversationRunStatus, setCurrentConversationId, setCurrentChatId,
    isSimpleConversation, currentConversationId, showToast, refetchChatHistory, loadPlan: data.loadPlan,
  }), [isSimpleConversation, currentConversationId, showToast, data.loadPlan])

  // ─── Send/Stop ───
  const handleStopJob = async () => {
    // Always set stop flag + close SSE first — even if no job ID yet
    // (user might click Stop while startScan API is still in-flight)
    stopRequestedRef.current = true
    if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null }
    pentestJobStreamAbortRef.current?.abort(); pentestJobStreamAbortRef.current = null

    if (currentJobId) {
      try {
        await gwehaiClient.stopJob(currentJobId)
        // Also call conversation stop to trigger backend AbortController
        if (currentConversationId) {
          apiClient.post(`/chat/conversations/${currentConversationId}/stop`).catch(() => {})
        }
      } catch (_e) { showToast('Failed to stop job.', 'error') }
    }
    setCurrentJobId(null); try { localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY) } catch (_) {}
    setIsLoading(false); sendInProgressRef.current = false; setCurrentStep(null)
    streamingMessageRef.current = null; currentAssistantMessageIdRef.current = null
    if (currentConversationId) setConversationRunStatus((prev) => ({ ...prev, [currentConversationId]: 'stopped' }))
    setActivityLog((prev) => [...prev.slice(-49), 'Text: Stopped by user'])
    setMessages((prev) => { const last = prev[prev.length - 1]; return last?.role === 'assistant' && last.isStreaming ? prev.map((m, i) => (i === prev.length - 1 ? { ...m, isStreaming: false, content: (m.content || '') + '\n\n_Pentest stopped._' } : m)) : prev })
    showToast('Pentest stopped.', 'info')
  }

  const handleSendWithText = async (messageOverride?: string) => {
    const userInput = (messageOverride ?? input.trim()).trim()
    if (!userInput || isLoading || sendInProgressRef.current) return
    if (data.atScanLimit) { showToast(data.myPlan?.scan_limit?.sessions_per_day != null ? `You've used your ${data.myPlan.scan_limit.sessions_started_today}/${data.myPlan.scan_limit.sessions_per_day} scans today.` : 'Plan limit reached.', 'warning', 6000); return }
    const lower = userInput.toLowerCase()
    if (lower === 'stop' || lower === 'stop pentest' || lower === 'stop the pentest' || lower === 'stop the scan') {
      setMessages((prev) => [...prev, makeUserMessage(userInput)]); setInput(''); inputRef.current?.focus()
      if (currentJobId) await handleStopJob(); else setMessages((prev) => [...prev, makeAssistantMessage('content')])
      sendInProgressRef.current = false; return
    }
    const withAgentsMatch = userInput.match(/\bwith\s+(\d+)\s+agents?\b/i)
    const maxAgents = withAgentsMatch ? Math.min(20, Math.max(1, parseInt(withAgentsMatch[1], 10))) : undefined
    const isSimple = chatMode === 'ask'; setIsSimpleConversation(isSimple)
    setMessages((prev) => [...prev, makeUserMessage(userInput), makeAssistantMessage(isSimple ? 'content' : 'thinking', selectedModelKey)])
    if (!messageOverride) setInput(''); inputRef.current?.focus()
    stopRequestedRef.current = false; sendInProgressRef.current = true; const isNewChat = !currentChatId
    setIsLoading(true); setCurrentStep(null); setActivityLog([]); setLogEvents([])
    if (!isSimple) setIsSimpleConversation(false)
    if (currentConversationId) setConversationRunStatus((prev) => ({ ...prev, [currentConversationId]: 'running' }))
    if (eventSourceRef.current) { intentionalCloseRef.current = true; eventSourceRef.current.close(); eventSourceRef.current = null }
    try {
      const jobRes = await gwehaiClient.startScan(userInput, false, currentConversationId || undefined, selectedModelKey, chatMode, selectedModelId ?? undefined, maxAgents)
      data.loadPlan().catch(() => {})
      const jobId = jobRes.job_id; setCurrentJobId(jobId); try { localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, jobId) } catch (_) {}
      const convId = jobRes.conversation_id ?? undefined
      if (convId) {
        setCurrentConversationId(convId); setConversationRunStatus((prev) => ({ ...prev, [convId]: 'running' }))
        if (isNewChat) { setCurrentChatId(convId); setChatHistory((prev) => { const n: ChatHistory = { id: convId, title: userInput.substring(0, 50), messages: messagesRef.current, createdAt: new Date(), updatedAt: new Date() }; const u = [n, ...prev.filter((c) => c.id !== convId)]; if (user?.id) localStorage.setItem(`gwehai_chat_history_${user.id}`, JSON.stringify(u)); return u }) }
      }
      const es = gwehaiClient.connectToEvents(jobId, (event: GwehAIEvent) => handleStreamEvent(event, streamCtx), (_error) => {
        if (intentionalCloseRef.current) return
        // Don't set isLoading=false here — EventSource auto-reconnects on transport errors.
        // Keep the stop button visible so users can abort if needed.
        // Only log the connection issue; typed SSE 'done'/'error' events handle cleanup.
        setActivityLog((prev) => [...prev.slice(-49), 'Text: Connection interrupted, reconnecting…'])
        showToast('Connection interrupted. Reconnecting…', 'warning')
      }, () => {})
      eventSourceRef.current = es; intentionalCloseRef.current = false
    } catch (error: any) {
      intentionalCloseRef.current = false; setIsLoading(false); streamingMessageRef.current = null; sendInProgressRef.current = false
      setMessages((prev) => { const l = prev[prev.length - 1]; return l && l.role === 'assistant' && !l.content && l.isStreaming ? prev.slice(0, -1) : prev })
      const errorText = error.message || 'Unknown error'
      const isPlanLimit = /Plan limit|maximum.*concurrent|sessions per day/i.test(errorText)
      const isContextTooLong = /conversation is too long|start a new chat/i.test(errorText)
      setMessages((prev) => [...prev, makeErrorMessage(isPlanLimit ? `${errorText}\n\nUpgrade for more.` : isContextTooLong ? `Error: ${errorText}\n\nStart a new chat.` : error.message || 'Error occurred.')])
      if (isPlanLimit) showToast(errorText, 'error', 6000); else if (isContextTooLong) showToast('Start a new chat.', 'warning', 6000); else showToast(errorText.substring(0, 100), 'error')
    }
  }
  const handleSend = () => handleSendWithText()
  const handleKeyPress = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }
  const handleLogout = () => { logout(); navigate('/login') }

  // ─── Effects ───
  useEffect(() => {
    const toastType = searchParams.get('toast'); if (!toastType || hasShownAuthToastRef.current) return
    const msgs: Record<string, string> = { login: "Welcome back!", google: "Signed in with Google!", register: 'Account created!', verified: "Account verified!" }
    if (msgs[toastType]) { hasShownAuthToastRef.current = true; showToast(msgs[toastType], 'success', 4000); setSearchParams((p) => { const n = new URLSearchParams(p); n.delete('toast'); return n }, { replace: true }) }
  }, [searchParams, setSearchParams])
  useEffect(() => { currentAssistantMessageIdRef.current = currentAssistantMessageId }, [currentAssistantMessageId])
  useEffect(() => { messageToolStateRef.current = messageToolState }, [messageToolState])
  useEffect(() => { toolsRef.current = tools }, [tools])
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { if (helpMessages.length > 0) helpMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [helpMessages])
  useEffect(() => { if (userNearBottomRef.current) messagesAreaRef.current?.scrollToBottom('smooth') }, [messages])
  useEffect(() => { const h = (e: MouseEvent) => { if (!(e.target as Element).closest('.chat-menu-container')) setOpenMenuId(null) }; if (openMenuId) { document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) } }, [openMenuId])
  useEffect(() => { return () => { if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null } } }, [])
  useEffect(() => { if (!user?.id || (initialDataLoadDoneRef.current && initialDataLoadUserIdRef.current === user.id)) return; initialDataLoadDoneRef.current = true; initialDataLoadUserIdRef.current = user.id; data.loadPlan(); data.loadUserProfile(); refetchChatHistory() }, [user?.id])
  useEffect(() => { if (showReportModal) data.loadReports() }, [showReportModal])
  useEffect(() => { if (showHacktivityModal) { data.loadHacktivityConversations(); data.loadHacktivity(1) } }, [showHacktivityModal])
  useEffect(() => { if (showHacktivityModal) data.loadHacktivity(data.hacktivityPage, data.selectedHacktivityConversationId) }, [data.hacktivityPage, data.selectedHacktivityConversationId])
  useEffect(() => { if (!showHacktivityModal) return; const t = setInterval(() => data.loadHacktivity(hacktivityPollRef.current.page, hacktivityPollRef.current.conversationId, { isBackgroundPoll: true }), 4000); return () => clearInterval(t) }, [showHacktivityModal])
  useEffect(() => {
    const toAnimate = messages.filter((m): m is Message & { thinking: string } => m.role === 'assistant' && Boolean((m.thinking ?? '').trim()) && ((m.thinkingDisplay?.length ?? 0) < (m.thinking ?? '').length))
    if (toAnimate.length === 0) return; const msg = toAnimate[toAnimate.length - 1]; const next = Math.min((msg.thinkingDisplay?.length ?? 0) + 4, msg.thinking!.length)
    const t = setTimeout(() => setMessages((p) => p.map((m) => m.id === msg.id ? { ...m, thinkingDisplay: msg.thinking!.slice(0, next) } : m)), 22); return () => clearTimeout(t)
  }, [messages])
  useEffect(() => {
    const toAnimate = messages.filter((m): m is Message & { content: string } => m.role === 'assistant' && !m.done && (m.content?.length ?? 0) > 0 && (!m.thinking?.trim() || (m.thinkingDisplay?.length ?? 0) >= (m.thinking?.length ?? 0)) && ((m.contentDisplay?.length ?? 0) < (m.content?.length ?? 0)))
    if (toAnimate.length === 0) return; const msg = toAnimate[toAnimate.length - 1]; const next = Math.min((msg.contentDisplay?.length ?? 0) + 5, msg.content!.length)
    const t = setTimeout(() => setMessages((p) => p.map((m) => m.id === msg.id ? { ...m, contentDisplay: msg.content!.slice(0, next) } : m)), 18); return () => clearTimeout(t)
  }, [messages])

  if (!isAuthenticated) return null

  // ─── Derived ───
  const planIdFromProfile = (user as any)?.planId as string | undefined
  const effectivePlanId = (planIdFromProfile || data.myPlan?.planId || 'FREE') as string
  const planFromTiers = PLAN_TIERS.find((t) => t.id === effectivePlanId)
  const planLabel = (planFromTiers && planFromTiers.name) || data.myPlan?.plan?.marketing_title || data.currentPlan?.plan?.name || data.currentPlan?.plan?.code || 'Free'
  const filteredChatHistory = chatHistory.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()))

  useEffect(() => { if (String(effectivePlanId).toUpperCase() === 'FREE' && selectedModelKey !== 'auto') { setSelectedModelKey('auto'); setStoredModelKey('auto') } }, [effectivePlanId, selectedModelKey])

  // ─── Render ───
  return (
    <div className="dashboard">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <DashboardLayout
        isSidebarOpen={sidebarOpen} onSidebarToggle={(open) => setSidebarOpen(open !== undefined ? open : !sidebarOpen)}
        isMobile={isMobile} sidebarCollapsed={sidebarCollapsed} chatCollapsed={chatCollapsed}
        onChatCollapseToggle={(c) => setChatCollapsed(c !== undefined ? c : !chatCollapsed)}
        sidebarHeader={<SidebarHeader isMobile={isMobile} sidebarCollapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed((c) => !c)} onNewChat={handleNewChat} onToggleSearch={() => setShowSearch(!showSearch)} showSearch={showSearch} searchQuery={searchQuery} onSearchQueryChange={setSearchQuery} onShowReport={() => { tour.stopTour(); setShowReportModal(true) }} onShowHacktivity={() => { tour.stopTour(); setShowHacktivityModal(true) }} onShowPlan={() => { tour.stopTour(); setShowPlanModal(true) }} onShowCurrentPentest={() => { tour.stopTour(); setShowCurrentPentestModal(true) }} />}
        sidebarList={<ChatSidebar sidebarOpen={sidebarOpen} sidebarCollapsed={sidebarCollapsed} isMobile={isMobile} chatsSectionCollapsed={chatsSectionCollapsed} filteredChatHistory={filteredChatHistory} currentChatId={currentChatId} editingChatId={editingChatId} editTitle={editTitle} openMenuId={openMenuId} onToggleChatsSection={() => setChatsSectionCollapsed((c) => !c)} onLoadChat={handleLoadChat} onStartRename={handleRenameChat} onSaveRename={handleSaveRename} onCancelRename={handleCancelRename} onDeleteChat={handleDeleteChat} onEditTitleChange={setEditTitle} onToggleMenu={setOpenMenuId} />}
        sidebarFooter={<ProfileFooter name={user?.name || user?.email || 'User'} email={user?.email} planLabel={planLabel} collapsed={!isMobile && sidebarCollapsed} onUpgrade={() => setShowUpgradeModal(true)} onSettings={() => setShowSettingsModal(true)} onHelp={() => setShowHelpModal(true)} onLogout={handleLogout} onRestartTour={() => { tour.resetAllTours(); tour.startTour('quick-start') }} />}
        mainContent={<main className="dashboard-chat" data-tour="progress-area"><ChatLayout topContent={messages.length === 0 ? (<><div className="chat-logo-section"><div className="chat-logo"><img src={logo} alt="GwehAI" className="chat-logo-image" /></div><h1 className="chat-logo-text">GwehAI</h1></div><div className="chat-empty-mobile"><h2 className="chat-empty-prompt">What would you like to test today?</h2><div className="chat-suggestions"><button type="button" className="chat-suggestion-btn" disabled={data.atScanLimit} onClick={() => handleSendWithText('Run a pentest on a target URL and report findings')} title={data.atScanLimit ? 'Daily scan limit reached' : undefined}><span className="chat-suggestion-icon chat-suggestion-icon-pentest">&#9876;</span><span>Run a pentest</span></button><button type="button" className="chat-suggestion-btn" disabled={data.atScanLimit} onClick={() => handleSendWithText('Explain SQL injection and how to test for it')}><span className="chat-suggestion-icon chat-suggestion-icon-learn">&#128214;</span><span>Explain a vulnerability</span></button><button type="button" className="chat-suggestion-btn" disabled={data.atScanLimit} onClick={() => handleSendWithText('Check this URL for security issues: https://example.com')}><span className="chat-suggestion-icon chat-suggestion-icon-check">&#128274;</span><span>Check a URL</span></button><button type="button" className="chat-suggestion-btn" disabled={data.atScanLimit} onClick={() => handleSendWithText('Give me step-by-step security testing tips for a web app')}><span className="chat-suggestion-icon chat-suggestion-icon-tips">&#128161;</span><span>Security tips</span></button></div></div></>) : undefined} composer={<ChatComposer chatMode={chatMode} onChatModeChange={setChatMode} selectedModelKey={selectedModelKey} onModelChange={(k, id) => { setSelectedModelKey(k); setStoredModelKey(k); setSelectedModelId(id ?? null) }} effectivePlanId={effectivePlanId} isLoading={isLoading} input={input} onInputChange={setInput} inputRef={inputRef} onSend={handleSend} onStop={handleStopJob} onKeyPress={handleKeyPress} isVoiceRecording={voice.isVoiceRecording} voiceTranscript={voice.voiceTranscript} onStartVoice={voice.startVoiceRecognition} onCancelVoice={voice.cancelVoiceInput} onConfirmVoice={voice.confirmVoiceInput} atScanLimit={data.atScanLimit} scanLimitInfo={data.myPlan?.scan_limit ? { sessions_started_today: data.myPlan.scan_limit.sessions_started_today, sessions_per_day: data.myPlan.scan_limit.sessions_per_day } : undefined} onViewPlans={() => setShowPlanModal(true)} />}><MessagesArea ref={messagesAreaRef} onNearBottomChange={(near) => { userNearBottomRef.current = near }}><ChatMessages messages={messages} isLoading={isLoading} isSimpleConversation={isSimpleConversation} messageToolsSnapshot={messageToolsSnapshot} currentStep={currentStep} activityLog={activityLog} logEvents={logEvents} pentestChecklistProgress={pentestChecklistProgress} onSendWithText={handleSendWithText} showToast={showToast} onStop={handleStopJob} disabled={isLoading} /></MessagesArea></ChatLayout></main>}
      />
      {showUpgradeModal && <UpgradeModal onClose={() => setShowUpgradeModal(false)} showToast={showToast} />}
      <SettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} settingsData={data.settingsData} onSettingsDataChange={(d) => data.setSettingsData((prev) => ({ ...prev, ...d }))} onSave={() => data.handleSaveSettings(refreshUser)} isSaving={data.isSavingSettings} user={user} emailReadOnly={!!user?.googleId} planId={data.subscriptionForSettings?.planId ?? data.myPlan?.planId} providerSubscriptionId={data.subscriptionForSettings?.providerSubscriptionId} onCancelSubscription={async () => { try { await apiClient.post('/subscriptions/cancel'); showToast('Subscription cancelled.', 'success'); data.setSubscriptionForSettings((prev) => prev ? { ...prev, planId: 'FREE', providerSubscriptionId: null } : null); data.loadPlan() } catch (e: any) { showToast(e.response?.data?.message || 'Failed.', 'error'); throw e } }} />
      {showHelpModal && <HelpModal messages={helpMessages} input={helpInput} isLoading={isHelpLoading} messagesEndRef={helpMessagesEndRef} onInputChange={setHelpInput} onSend={handleHelpSend} onClose={() => setShowHelpModal(false)} />}
      {showReportModal && <ReportModal reports={data.reports} isLoading={data.isLoadingReports} reportDetailKey={data.reportDetailKey} findings={data.reportFindings} findingsLoading={data.reportFindingsLoading} selectedFinding={data.selectedFinding} onSetDetailKey={data.setReportDetailKey} onSetFindings={(f) => data.setReportFindings(f)} onSelectFinding={data.setSelectedFinding} onSelectFindingId={data.setSelectedFindingId} onLoadFindings={(d, dt, c) => data.loadFindingsForDomainAndDate(d, dt, c ?? undefined)} onClose={() => { data.closeReportModal(); setShowReportModal(false) }} />}
      {showHacktivityModal && <HacktivityModal selectedHacktivity={data.selectedHacktivity} hacktivityList={data.hacktivityList} hacktivityConversations={data.hacktivityConversations} selectedHacktivityConversationId={data.selectedHacktivityConversationId} hacktivityPage={data.hacktivityPage} hacktivityTotal={data.hacktivityTotal} hacktivityPageSize={data.hacktivityPageSize} isLoading={data.isLoadingHacktivity} loadError={data.hacktivityLoadError} onSelectHacktivity={data.setSelectedHacktivity} onSelectHacktivityId={data.setSelectedHacktivityId} onSelectConversation={data.setSelectedHacktivityConversationId} onPageChange={data.setHacktivityPage} onLoadHacktivity={data.loadHacktivity} getActionLabel={data.getHacktivityActionLabel} onClose={() => { data.closeHacktivityModal(); setShowHacktivityModal(false) }} />}
      {showPlanModal && <PlanModal isLoading={data.isLoadingPlan} myPlan={data.myPlan} currentPlan={data.currentPlan} onUpgrade={() => { setShowPlanModal(false); setShowUpgradeModal(true) }} onClose={() => setShowPlanModal(false)} />}
      {showCurrentPentestModal && <CurrentPentestModal jobs={currentPentestJobs} isLoading={currentPentestLoading} error={currentPentestError} onClose={() => setShowCurrentPentestModal(false)} onOpenConversation={(cid) => { setCurrentChatId(cid); setCurrentConversationId(cid); refetchChatHistory(); setShowCurrentPentestModal(false) }} />}
    </div>
  )
}

export default Dashboard
