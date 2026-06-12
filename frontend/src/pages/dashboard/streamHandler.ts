import type { Message, ToolState } from './types'
import type { LogEvent, LogPhase } from '../../components/GwehLog'
import type { ModelKey } from '../../components/ModelPicker'
import type { GwehAIEvent } from '../../utils/gwehaiApi'
import {
  makeAssistantMessage,
  updateContent,
  markDone,
  cleanStreamChunk,
  initialToolState,
  startToolState,
  endToolState,
  makeTool,
} from './messageOps'

/**
 * Context passed into handleStreamEvent — all the refs and setters
 * the handler needs. Dashboard provides these from its own state.
 */
export interface StreamHandlerContext {
  // Refs
  stopRequestedRef: React.MutableRefObject<boolean>
  currentAssistantMessageIdRef: React.MutableRefObject<string | null>
  messagesRef: React.MutableRefObject<Message[]>
  messageToolStateRef: React.MutableRefObject<Record<string, ToolState>>
  toolsRef: React.MutableRefObject<Record<string, any>>
  lastCompletedAssistantMessageIdRef: React.MutableRefObject<string | null>
  pendingAssistantMessageIdRef: React.MutableRefObject<string | null>
  lastReasoningFromBackendRef: React.MutableRefObject<string | null>
  streamMessageMapRef: React.MutableRefObject<Record<string, string>>
  streamingMessageRef: React.MutableRefObject<number | null>
  sendInProgressRef: React.MutableRefObject<boolean>
  eventSourceRef: React.MutableRefObject<EventSource | null>
  intentionalCloseRef: React.MutableRefObject<boolean>

  // State setters
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  setTools: React.Dispatch<React.SetStateAction<Record<string, any>>>
  setMessageTools: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
  setMessageToolState: React.Dispatch<React.SetStateAction<Record<string, ToolState>>>
  setCurrentAssistantMessageId: React.Dispatch<React.SetStateAction<string | null>>
  setCurrentStep: React.Dispatch<React.SetStateAction<string | null>>
  setActivityLog: React.Dispatch<React.SetStateAction<string[]>>
  setLogEvents: React.Dispatch<React.SetStateAction<LogEvent[]>>
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  setIsSimpleConversation: React.Dispatch<React.SetStateAction<boolean>>
  setConversationRunStatus: React.Dispatch<React.SetStateAction<Record<string, 'running' | 'finished' | 'error' | 'stopped'>>>
  setCurrentConversationId: React.Dispatch<React.SetStateAction<string | null>>
  setCurrentChatId: React.Dispatch<React.SetStateAction<string | null>>

  // Read-only state
  isSimpleConversation: boolean
  currentConversationId: string | null

  // Callbacks
  showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning', duration?: number) => void
  refetchChatHistory: () => Promise<void>
  loadPlan: () => Promise<void>
}

// ─── Activity log helpers ───

function messageToLogPhase(body: string): LogPhase {
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

function categorizeStep(body: string): string {
  const lower = body.toLowerCase()
  if (lower.includes('planning')) return 'Planning'
  if (
    lower.startsWith('running') ||
    lower.startsWith('reading') ||
    lower.startsWith('writing') ||
    lower.startsWith('searching') ||
    lower.startsWith('sending') ||
    lower.startsWith('spawning') ||
    lower.startsWith('listing') ||
    lower.startsWith('fetching') ||
    lower.startsWith('status for session') ||
    lower.startsWith('session status')
  ) return 'Running'
  return 'Text'
}

// ─── Tool reasoning helpers ───

function computeToolReasoning(toolName: string, toolInput: any): string {
  if (toolName === 'memory_search')
    return `Searching memory for: ${(toolInput?.query ?? '').toString().slice(0, 60) || '...'}`
  if (toolName === 'memory_get')
    return `Reading ${(toolInput?.path ?? '').toString()}`
  if (toolName === 'write_file')
    return `Writing to ${(toolInput?.path ?? '').toString()}`
  if (toolName === 'exec')
    return `Running: ${(toolInput?.command ?? '').toString().trim().slice(0, 60)}${(toolInput?.command ?? '').toString().length > 60 ? '...' : ''}`
  return `Running: ${toolName}`
}

// ─── Main handler ───

/**
 * Process a single SSE event from the GwehAI backend.
 * Extracted from Dashboard.tsx handleStreamEvent (~480 lines).
 */
export function handleStreamEvent(
  event: GwehAIEvent,
  ctx: StreamHandlerContext,
): void {
  if (ctx.stopRequestedRef.current) return

  // Debug logging
  if (event.type !== 'message_delta' && event.type !== 'content') {
    const dataSummary = event.type === 'status' ? event.data?.message
      : event.type === 'reasoning' ? event.data?.message
      : event.type === 'tool_start' ? `${event.data?.name ?? event.data?.tool} ${JSON.stringify(event.data?.input ?? {})}`
      : event.type === 'tool_log' ? (typeof event.data?.text === 'string' && event.data.text.length > 80 ? event.data.text.slice(0, 80) + '...' : event.data?.text)
      : event.type === 'tool_end' ? event.data?.status : event.data
    console.log('[GwehAI Dashboard] handleStreamEvent:', event.type, dataSummary ?? event.data)
  }

  // ─── Internal helpers ───

  const addAssistantMessage = (eventType?: Message['eventType'], modelKey?: ModelKey) => {
    const msg = makeAssistantMessage(eventType, modelKey)
    ctx.setMessages((prev) => {
      const updated = [...prev, msg]
      ctx.messagesRef.current = updated
      return updated
    })
    ctx.setCurrentAssistantMessageId(msg.id)
    ctx.currentAssistantMessageIdRef.current = msg.id
    return msg.id
  }

  const ensureToolList = (messageId: string) => {
    ctx.setMessageTools((prev) => (prev[messageId] ? prev : { ...prev, [messageId]: [] }))
  }

  const ensureToolState = (messageId: string) => {
    ctx.setMessageToolState((prev) => {
      if (prev[messageId]) return prev
      return { ...prev, [messageId]: initialToolState() }
    })
  }

  const startTool = (toolCallId: string, name: string, input: any, targetMessageId?: string | null, reasoning?: string) => {
    let messageId = targetMessageId || ctx.currentAssistantMessageIdRef.current
    const currentMsg = messageId ? ctx.messagesRef.current.find((m) => m.id === messageId) : undefined
    const toolState = messageId ? ctx.messageToolStateRef.current[messageId] : undefined

    if (!messageId || (currentMsg && currentMsg.done) || (toolState && toolState.toolsComplete)) {
      messageId = addAssistantMessage('tool')
    }

    ensureToolList(messageId)
    ensureToolState(messageId)

    const newToolState = startToolState(ctx.messageToolStateRef.current[messageId!])
    ctx.messageToolStateRef.current[messageId!] = newToolState
    ctx.setMessageToolState((prev) => ({ ...prev, [messageId!]: newToolState }))

    const newTool = makeTool(toolCallId, name, input, messageId!, reasoning)
    ctx.toolsRef.current[toolCallId] = newTool
    ctx.setTools((prev) => ({ ...prev, [toolCallId]: newTool }))
    ctx.setMessageTools((prev) => ({
      ...prev,
      [messageId!]: [...(prev[messageId!] || []), toolCallId],
    }))
  }

  const appendToolLog = (toolCallId: string, text: string) => {
    const tool = ctx.toolsRef.current[toolCallId]
    if (!tool) return
    const updatedTool = { ...tool, logs: [...tool.logs, text] }
    ctx.toolsRef.current[toolCallId] = updatedTool
    ctx.setTools((prev) => ({ ...prev, [toolCallId]: updatedTool }))
  }

  const endTool = (toolCallId: string, status: 'ok' | 'error', output: any) => {
    const tool = ctx.toolsRef.current[toolCallId]
    if (!tool) return
    const updatedTool = { ...tool, status, output }
    ctx.toolsRef.current[toolCallId] = updatedTool
    ctx.setTools((prev) => ({ ...prev, [toolCallId]: updatedTool }))

    const messageId = tool.messageId
    if (!messageId) return
    const state = ctx.messageToolStateRef.current[messageId]
    if (!state) return

    const newState = endToolState(state)
    ctx.messageToolStateRef.current[messageId] = newState
    ctx.setMessageToolState((prev) => ({ ...prev, [messageId]: newState }))
  }

  const appendActivityStep = (step: string, agentLabel?: string) => {
    const raw = String(step || '').trim()
    if (!raw) return
    const displayBase = agentLabel ? `${agentLabel}: ${raw}` : raw
    const prefixedMatch = displayBase.match(/^\[([^\]]+)\]\s*(.*)$/)
    const prefix = prefixedMatch ? `[${prefixedMatch[1]}] ` : ''
    const body = (prefixedMatch ? prefixedMatch[2] : displayBase).trim()
    const category = categorizeStep(body)
    const normalizedBody = /^(planning|running|text)\s*:\s*/i.test(body) ? body : `${category}: ${body}`
    const display = `${prefix}${normalizedBody}`.trim()
    ctx.setActivityLog((prev) => {
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
    ctx.setLogEvents((prev) => [...prev.slice(-199), logEvent])
  }

  const getCurrentMessage = () => {
    const messageId = ctx.currentAssistantMessageIdRef.current
    return messageId ? ctx.messagesRef.current.find((m) => m.id === messageId) : undefined
  }

  const ensureAssistantForText = () => {
    let messageId = ctx.currentAssistantMessageIdRef.current
    const toolState = messageId ? ctx.messageToolStateRef.current[messageId] : undefined
    const currentMessage = getCurrentMessage()

    if (!messageId) {
      messageId = addAssistantMessage('content')
    } else if (currentMessage && currentMessage.done) {
      messageId = addAssistantMessage('content')
    } else if (toolState && toolState.toolsComplete && currentMessage?.done) {
      messageId = addAssistantMessage('content')
    }
    return messageId
  }

  // ─── Event dispatch ───

  switch (event.type) {
    case 'connected':
      return

    case 'message_id': {
      let messageId = ctx.currentAssistantMessageIdRef.current
      if (!messageId) {
        messageId = addAssistantMessage('planning')
      }
      ctx.setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === messageId ? { ...m, eventType: 'planning', isStreaming: true } : m,
        )
        ctx.messagesRef.current = updated
        return updated
      })
      return
    }

    case 'thinking': {
      let messageId = ctx.currentAssistantMessageIdRef.current
      if (!messageId) {
        messageId = addAssistantMessage('thinking')
      }
      ctx.setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === messageId
            ? { ...m, content: `${event.data.message || 'Thinking...'}`, eventType: 'thinking', isStreaming: true }
            : m,
        )
        ctx.messagesRef.current = updated
        return updated
      })
      return
    }

    case 'reasoning_block': {
      const thinkingText = event.data?.message || ''
      if (!thinkingText.trim()) return
      const agentLabel = event.data?.agent_label as string | undefined
      const prefix = agentLabel ? `${agentLabel} ` : ''
      let messageId = ctx.currentAssistantMessageIdRef.current || ctx.lastCompletedAssistantMessageIdRef.current
      if (!messageId) {
        messageId = addAssistantMessage('content')
      }
      ctx.setMessages((prev) => {
        const next = prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                thinking: (msg.thinking || '') + thinkingText,
                thinkingDisplay: '',
                role: 'assistant' as const,
              }
            : msg,
        )
        ctx.messagesRef.current = next
        return next
      })
      const stepLabel = prefix ? `${prefix}Thinking...` : 'Thinking...'
      ctx.setCurrentStep(stepLabel)
      appendActivityStep(stepLabel)
      return
    }

    case 'reasoning': {
      const reasoningMessage = event.data?.message || 'Reasoning...'
      const agentLabel = event.data?.agent_label as string | undefined
      const prefix = agentLabel ? `${agentLabel} ` : ''
      const displayReasoning = prefix ? `${prefix}${reasoningMessage}` : reasoningMessage
      ctx.lastReasoningFromBackendRef.current = reasoningMessage
      ctx.setCurrentStep(displayReasoning)
      appendActivityStep(reasoningMessage, agentLabel)
      return
    }

    case 'tool':
    case 'tool_start': {
      const toolCallId = event.data.tool_call_id || `tool-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const toolName = event.data.tool || event.data.name || 'Unknown tool'
      const toolInput = event.data.input ?? event.data.args ?? {}
      let targetMessageId = ctx.lastCompletedAssistantMessageIdRef.current || ctx.currentAssistantMessageIdRef.current
      if (!targetMessageId) {
        targetMessageId = addAssistantMessage('executing')
      }
      const computedReasoning = computeToolReasoning(toolName, toolInput)
      const reasoningToShow = ctx.lastReasoningFromBackendRef.current ?? computedReasoning
      ctx.lastReasoningFromBackendRef.current = null
      const agentLabel = event.data?.agent_label as string | undefined
      const prefixedReasoning = agentLabel ? `${agentLabel} ` + reasoningToShow : reasoningToShow
      ctx.setCurrentStep(prefixedReasoning)
      appendActivityStep(reasoningToShow, agentLabel)
      startTool(toolCallId, toolName, toolInput, targetMessageId, prefixedReasoning)
      return
    }

    case 'tool_log': {
      const logToolId = event.data.tool_call_id
      const logText = event.data.text || event.data.log || ''
      if (logToolId) appendToolLog(logToolId, logText)
      return
    }

    case 'tool_end':
    case 'result': {
      const endToolId = event.data.tool_call_id
      const toolStatus = event.data.status || 'ok'
      const toolOutput = event.data.output || event.data.result || null
      if (endToolId) endTool(endToolId, toolStatus === 'error' ? 'error' : 'ok', toolOutput)
      return
    }

    case 'message_delta':
    case 'content': {
      let chunk = event.data.delta || event.data.chunk || event.data.content || event.data.text || ''
      const cleanChunk = cleanStreamChunk(chunk)
      if (!cleanChunk) return

      let messageId: string | undefined
      const incomingStreamMessageId = event.data.message_id

      if (incomingStreamMessageId) {
        messageId = ctx.streamMessageMapRef.current[incomingStreamMessageId]
        if (!messageId) {
          if (ctx.pendingAssistantMessageIdRef.current) {
            messageId = ctx.pendingAssistantMessageIdRef.current
            ctx.pendingAssistantMessageIdRef.current = null
          } else {
            messageId = addAssistantMessage('content')
          }
          ctx.streamMessageMapRef.current[incomingStreamMessageId] = messageId
        }
        ctx.currentAssistantMessageIdRef.current = messageId
      } else {
        messageId = ensureAssistantForText()
      }

      ctx.setMessages((prev) => {
        const updated = updateContent(messageId, cleanChunk)(prev)
        ctx.messagesRef.current = updated
        return updated
      })
      return
    }

    case 'message_done':
    case 'content_done': {
      const incomingStreamMessageId = event.data.message_id
      const messageId = incomingStreamMessageId
        ? ctx.streamMessageMapRef.current[incomingStreamMessageId]
        : ctx.currentAssistantMessageIdRef.current
      if (messageId) {
        ctx.setMessages((prev) => {
          const updated = markDone(messageId)(prev)
          ctx.messagesRef.current = updated
          return updated
        })
        ctx.lastCompletedAssistantMessageIdRef.current = messageId
        if (ctx.pendingAssistantMessageIdRef.current === messageId) {
          ctx.pendingAssistantMessageIdRef.current = null
        }
      }
      return
    }

    case 'simple_response': {
      const incomingStreamMessageId = event.data.message_id
      const messageId = incomingStreamMessageId
        ? ctx.streamMessageMapRef.current[incomingStreamMessageId]
        : ctx.lastCompletedAssistantMessageIdRef.current
      if (!messageId) return
      const details = event.data.details
      const followUps = Array.isArray(event.data.followUps)
        ? event.data.followUps.filter((s: unknown) => typeof s === 'string')
        : undefined
      ctx.setMessages((prev) => {
        const updated = prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                ...(details != null && details !== '' && { details: String(details) }),
                ...(followUps != null && followUps.length > 0 && { followUps }),
              }
            : msg,
        )
        ctx.messagesRef.current = updated
        return updated
      })
      return
    }

    case 'status': {
      if (event.data.simple_mode === true) {
        ctx.setIsSimpleConversation(true)
      }
      const statusMessage = event.data.message || ''
      const agentLabel = event.data?.agent_label as string | undefined
      const prefix = agentLabel ? `${agentLabel} ` : ''
      const displayMessage = prefix ? `${prefix}${statusMessage}` : statusMessage
      const normalized = statusMessage.toLowerCase()

      let messageId = ctx.currentAssistantMessageIdRef.current
      ctx.setIsLoading(true)
      const inSimpleMode = event.data.simple_mode === true
      let eventType: string | undefined

      if (inSimpleMode) {
        eventType = 'content'
        messageId = ctx.currentAssistantMessageIdRef.current || ctx.lastCompletedAssistantMessageIdRef.current || addAssistantMessage('content')
        ctx.pendingAssistantMessageIdRef.current = messageId
        ctx.setCurrentStep(null)
      } else if (normalized.includes('planning the plan')) {
        eventType = 'planning'
        ctx.setCurrentStep(displayMessage)
        appendActivityStep(statusMessage, agentLabel)
        const currentMessage = messageId ? ctx.messagesRef.current.find((m) => m.id === messageId) : undefined
        if (!messageId || (currentMessage && currentMessage.content)) {
          messageId = addAssistantMessage('planning')
        }
        ctx.pendingAssistantMessageIdRef.current = messageId
      } else if (normalized.includes('executing') || normalized.includes('running tools')) {
        eventType = 'executing'
        const step = normalized.includes('running tools') ? 'Running tools...' : 'Executing the plan...'
        ctx.setCurrentStep(prefix ? `${prefix}${step}` : step)
        appendActivityStep(step, agentLabel)
        messageId = ctx.lastCompletedAssistantMessageIdRef.current || messageId
      } else if (normalized.includes('planning next plan')) {
        eventType = 'planning-next'
        const step = 'Planning next plan...'
        ctx.setCurrentStep(prefix ? `${prefix}${step}` : step)
        appendActivityStep(step, agentLabel)
        messageId = ctx.lastCompletedAssistantMessageIdRef.current || messageId
      } else if (normalized.includes('writing response')) {
        eventType = 'content'
        const step = 'Writing response...'
        ctx.setCurrentStep(prefix ? `${prefix}${step}` : step)
        appendActivityStep(step, agentLabel)
        messageId = ctx.lastCompletedAssistantMessageIdRef.current || messageId
      } else {
        eventType = 'executing'
        ctx.setCurrentStep(displayMessage)
        appendActivityStep(statusMessage, agentLabel)
        messageId = ctx.lastCompletedAssistantMessageIdRef.current || messageId
      }

      if (messageId && eventType) {
        ctx.setMessages((prev) => {
          const exists = prev.some((m) => m.id === messageId)
          if (!exists) {
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
            ctx.messagesRef.current = updated
            return updated
          }
          const updated = prev.map((msg) =>
            msg.id === messageId ? { ...msg, eventType } : msg,
          )
          ctx.messagesRef.current = updated
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
        ctx.showToast(comfortText, 'info', 7000)
        appendActivityStep(`Text: ${comfortText}`, event.data.agent_label as string | undefined)
        return
      }

      ctx.sendInProgressRef.current = false
      ctx.setIsLoading(false)
      ctx.setIsSimpleConversation(false)
      ctx.streamingMessageRef.current = null
      const messageId = ctx.currentAssistantMessageIdRef.current || addAssistantMessage('error')
      appendActivityStep(`Error: ${errorMessage}`, event.data.agent_label as string | undefined)
      const isAborted =
        event.data.error_code === 'request_aborted' ||
        /\baborted\b|cancelled|canceled/i.test(errorMessage)
      const isContextTooLong =
        event.data.error_code === 'context_too_long' ||
        /conversation is too long|start a new chat/i.test(errorMessage)
      if (isAborted) {
        ctx.showToast('Request was cancelled before completion.', 'info', 4000)
      } else if (isContextTooLong) {
        ctx.showToast('Conversation is too long. Start a new chat to continue.', 'warning', 6000)
      }
      const displayContent = isAborted
        ? `Stopped: ${errorMessage}`
        : isContextTooLong
        ? `Error: ${errorMessage}\n\nTip: Start a new chat to continue — your previous messages won't be sent to the model.`
        : `Error: ${errorMessage}\n\nDon't worry, if the run is still active in the backend, findings will continue to be saved in the report.`
      ctx.setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: displayContent, eventType: 'error', isStreaming: false, done: true }
            : m,
        ),
      )
      if (ctx.currentConversationId) {
        ctx.setConversationRunStatus((prev) => ({ ...prev, [ctx.currentConversationId!]: 'error' }))
      }
      if (ctx.eventSourceRef.current) {
        ctx.eventSourceRef.current.close()
        ctx.eventSourceRef.current = null
      }
      try { localStorage.removeItem('gwehai_current_pentest_job_id') } catch (_) {}
      return
    }

    case 'done': {
      const hasAgentIndex = event.data.agent_index != null
      const isMainAgentDone = !hasAgentIndex || Number(event.data.agent_index) === 1
      if (!isMainAgentDone) {
        const subAgentLabel = (event.data.agent_label as string | undefined) || `Agent ${String(event.data.agent_index)}`
        if (!ctx.isSimpleConversation) {
          appendActivityStep('Done', subAgentLabel)
        }
        return
      }

      ctx.sendInProgressRef.current = false
      ctx.setIsLoading(false)
      ctx.setCurrentStep(null)
      if (!ctx.isSimpleConversation) {
        appendActivityStep('Done')
      }
      ctx.streamingMessageRef.current = null
      ctx.setIsSimpleConversation(false)
      if (event.data.conversation_id) {
        const cid = event.data.conversation_id
        ctx.setCurrentConversationId(cid)
        ctx.setConversationRunStatus((prev) => ({ ...prev, [cid]: 'finished' }))
        try { localStorage.setItem('gwehai_current_pentest_conversation_id', cid) } catch (_) {}
        ctx.setCurrentChatId(cid)
        ctx.refetchChatHistory()
      } else if (ctx.currentConversationId) {
        ctx.setConversationRunStatus((prev) => ({ ...prev, [ctx.currentConversationId!]: 'finished' }))
      }
      const messageId = ctx.currentAssistantMessageIdRef.current
      if (messageId) {
        ctx.setMessages((prev) => {
          const updated = markDone(messageId)(prev)
          ctx.messagesRef.current = updated
          return updated
        })
      }
      if (event.data.report_path) {
        ctx.showToast('Scan completed! Report available.', 'success')
      }
      if (ctx.eventSourceRef.current) {
        ctx.eventSourceRef.current.close()
        ctx.eventSourceRef.current = null
      }
      try { localStorage.removeItem('gwehai_current_pentest_job_id') } catch (_) {}
      return
    }

    default: {
      if (event.data.message) {
        const messageId = ensureAssistantForText()
        ctx.setMessages((prev) => {
          const updated = updateContent(messageId, String(event.data.message || ''))(prev)
          ctx.messagesRef.current = updated
          return updated
        })
      }
      return
    }
  }
}
