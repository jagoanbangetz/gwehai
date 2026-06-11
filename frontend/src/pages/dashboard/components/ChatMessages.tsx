import { useState } from 'react'
import MarkdownMessage from '../../../components/MarkdownMessage'
import FollowUpChips from '../../../components/FollowUpChips'
import ThinkingBar from '../../../components/ThinkingBar'
import StatusBadge from '../../../components/StatusBadge'
import ProgressIndicator from '../../../components/ProgressIndicator'
import type { ProgressState } from '../../../components/ProgressIndicator'
import { GwehLogRenderer } from '../../../components/GwehLog'
import { getModelLabel } from '../../../components/ModelPicker'
import AnsiText from '../../../components/AnsiText'
import type { Message } from '../types'
import type { LogEvent } from '../../../components/GwehLog'

interface ChatMessagesProps {
  messages: Message[]
  isLoading: boolean
  isSimpleConversation: boolean
  messageToolsSnapshot: Record<string, string[]>
  currentStep: string | null
  activityLog: string[]
  logEvents: LogEvent[]
  pentestChecklistProgress: { phase: string; phase_display?: string; current_section_display?: string | null; checklist: Record<string, boolean> } | null
  onSendWithText: (text: string) => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void
  onStop?: () => void
  disabled?: boolean
}

/** Tool status icon using Font Awesome */
function toolStatusIcon(status: string) {
  if (status === 'running') return <i className="fa-solid fa-spinner fa-spin" />
  if (status === 'ok') return <i className="fa-solid fa-circle-check" />
  return <i className="fa-solid fa-circle-xmark" />
}

/** Tool status CSS modifier */
function toolStatusMod(status: string) {
  if (status === 'running') return 'running'
  if (status === 'ok') return 'success'
  return 'failed'
}

/**
 * V4 Chat UI — ChatGPT/DeepSeek Style
 * Clean chat bubbles for everything. Thinking is expandable accordion.
 * Tool output rendered as light chat bubbles — NO terminal blocks.
 */
export default function ChatMessages({
  messages,
  isLoading,
  isSimpleConversation,
  messageToolsSnapshot,
  currentStep,
  activityLog,
  logEvents,
  pentestChecklistProgress,
  onSendWithText,
  showToast: _showToast,
  onStop,
  disabled,
}: ChatMessagesProps) {
  // Track which tool bubbles are collapsed
  const [collapsedTools, setCollapsedTools] = useState<Record<string, boolean>>({})
  // Track which thinking sections are expanded
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({})

  const toggleTool = (toolId: string) => {
    setCollapsedTools((prev) => ({ ...prev, [toolId]: !prev[toolId] }))
  }

  const toggleThinking = (msgId: string) => {
    setExpandedThinking((prev) => ({ ...prev, [msgId]: !prev[msgId] }))
  }

  // Derive progress state for ProgressIndicator
  const lastMsg = messages[messages.length - 1]
  const isStreaming = lastMsg?.role === 'assistant' && lastMsg.isStreaming && !lastMsg.done
  const progressState: ProgressState = (() => {
    if (!isLoading && !isStreaming) return 'idle'
    if (lastMsg?.eventType === 'error') return 'error'
    if (isStreaming) {
      if (lastMsg?.eventType === 'thinking' || lastMsg?.eventType === 'planning') return 'thinking'
      return 'generating'
    }
    if (lastMsg?.done) return 'done'
    return 'thinking'
  })()

  if (messages.length === 0) {
    return (
      <div className="chat-empty">
        <p className="empty-text">Start a conversation with GwehAI</p>
        <p className="empty-subtext">Ask security questions or request a pentest (e.g., "What is SQL injection?" or "pentest https://example.com")</p>
      </div>
    )
  }

  return (
    <div className="chat-messages">
      {/* Progress indicator */}
      <ProgressIndicator
        state={progressState}
        currentStep={currentStep}
        activityLog={activityLog}
        onStop={onStop}
      />
      {messages
        .filter((message) => {
          if (message.role === 'user') return true
          if (message.role === 'assistant' && (message.eventType === 'planning' || message.eventType === 'thinking' || message.eventType === 'content' || message.eventType === 'executing' || message.eventType === 'planning-next')) {
            return true
          }
          const content = String(message.content || '').trim()
          const hasThinking = String(message.thinking || '').trim().length > 0
          if (!content && !hasThinking) return false
          if (content === '0' || content === 'false' || content === 'undefined' || content === 'null') {
            return false
          }
          const hasTools = (messageToolsSnapshot[message.id] || []).length > 0
          if (!content && !hasThinking && !hasTools) return false
          return true
        })
        .map((message) => {
          const isUser = message.role === 'user'
          const isAssistant = message.role === 'assistant'
          const toolIds = messageToolsSnapshot[message.id] || []
          const hasTools = toolIds.length > 0

          // Determine status for badge
          let badgeStatus: 'streaming' | 'done' | 'error' | 'stopped' | 'thinking' | null = null
          if (isAssistant) {
            if (message.isStreaming && !message.done) {
              badgeStatus = message.eventType === 'thinking' || message.eventType === 'planning' ? 'thinking' : 'streaming'
            } else if (message.eventType === 'error') {
              badgeStatus = 'error'
            } else if (message.done) {
              badgeStatus = 'done'
            }
          }

          return (
            <div
              key={message.id}
              className={`chat-message ${isUser ? 'chat-message--user' : 'chat-message--assistant'} ${message.isStreaming ? 'chat-message--streaming' : ''}`}
            >
              {/* Avatar */}
              <div className="chat-message__avatar">
                {isUser ? (
                  <i className="fa-solid fa-user chat-message__avatar-fa" />
                ) : (
                  <i className="fa-solid fa-robot chat-message__avatar-fa" />
                )}
              </div>

              <div className="chat-message__content">
                {/* Status badge for assistant messages */}
                {isAssistant && badgeStatus && (
                  <StatusBadge status={badgeStatus} modelKey={message.modelKey} />
                )}

                {/* Model label */}
                {isAssistant && message.modelKey && message.modelKey !== 'auto' && !badgeStatus && (
                  <div className="assistant-model-label">
                    <span className="assistant-model-name">{getModelLabel(message.modelKey)}</span>
                  </div>
                )}

                {/* Thinking block — expandable accordion (ChatGPT/DeepSeek style) */}
                {isAssistant && message.thinking && (message.thinkingDisplay || message.thinking) && (() => {
                  const isThinkingExpanded = expandedThinking[message.id]
                  return (
                    <div className={`thinking-accordion ${isThinkingExpanded ? 'thinking-accordion--expanded' : ''}`}>
                      <button
                        type="button"
                        className="thinking-accordion__trigger"
                        onClick={() => toggleThinking(message.id)}
                        aria-expanded={isThinkingExpanded}
                      >
                        <i className="fa-solid fa-brain thinking-accordion__icon" />
                        <span className="thinking-accordion__label">
                          {message.isStreaming ? 'Thinking...' : 'Thinking'}
                        </span>
                        <span className="thinking-accordion__chevron">
                          <i className={`fa-solid fa-chevron-${isThinkingExpanded ? 'up' : 'down'}`} />
                        </span>
                      </button>
                      {isThinkingExpanded && (
                        <div className="thinking-accordion__body">
                          <div className="thinking-accordion__text">
                            {message.thinkingDisplay || message.thinking}
                            {message.isStreaming && (!message.thinkingDisplay || message.thinkingDisplay.length < message.thinking.length) && (
                              <span className="thinking-cursor" />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Simple conversation indicator */}
                {isAssistant && isSimpleConversation && message.isStreaming && !message.done && !message.content && (
                  <div className="chat-simple-indicator">
                    <span className="chat-simple-indicator-text">Replying</span>
                    <span className="chat-simple-indicator-dots">
                      <span /><span /><span />
                    </span>
                  </div>
                )}

                {/* ThinkingBar (for agent mode) */}
                {isAssistant && !isSimpleConversation && (message.isStreaming || currentStep || activityLog.length > 0) && (
                  <ThinkingBar
                    currentStep={currentStep}
                    steps={activityLog}
                    isStreaming={message.isStreaming}
                    checklistProgress={pentestChecklistProgress}
                  />
                )}

                {/* GwehLog events */}
                {isAssistant && logEvents.length > 0 && message.isStreaming && (
                  <GwehLogRenderer events={logEvents} />
                )}

                {/* ── Tool Output Bubbles (V4: clean chat style, NO terminal blocks) ── */}
                {isAssistant && hasTools && toolIds.map((toolId: string) => {
                  const tool = (window as any).__gwehai_tools?.[toolId]
                  if (!tool) return null
                  const isRunning = tool.status === 'running'
                  const isCollapsed = collapsedTools[toolId]

                  return (
                    <div
                      key={toolId}
                      className={`tool-bubble tool-bubble--${toolStatusMod(tool.status)}`}
                    >
                      <button
                        type="button"
                        className="tool-bubble__header"
                        onClick={() => toggleTool(toolId)}
                        aria-expanded={!isCollapsed}
                      >
                        <span className="tool-bubble__status-icon">
                          {toolStatusIcon(tool.status)}
                        </span>
                        <span className="tool-bubble__tool-name">{tool.name}</span>
                        {tool.reasoning && (
                          <span className="tool-bubble__reasoning">{tool.reasoning}</span>
                        )}
                        <span className="tool-bubble__chevron">
                          <i className={`fa-solid fa-chevron-${isCollapsed ? 'down' : 'up'}`} />
                        </span>
                      </button>
                      {!isCollapsed && tool.logs.length > 0 && (
                        <div className="tool-bubble__body">
                          {tool.logs.map((line: string, idx: number) => (
                            <div key={idx} className="tool-bubble__line">
                              <AnsiText text={line} />
                            </div>
                          ))}
                          {isRunning && <span className="tool-bubble__cursor" />}
                        </div>
                      )}
                      {!isCollapsed && isRunning && tool.logs.length === 0 && (
                        <div className="tool-bubble__body">
                          <span className="tool-bubble__cursor" />
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Main content */}
                {isAssistant && message.content ? (
                  <div className={`assistant-response ${message.isStreaming && !message.done ? 'assistant-response--streaming' : ''}`}>
                    <MarkdownMessage
                      content={message.contentDisplay ?? message.content}
                    />
                    {message.isStreaming && !message.done && (!message.thinking || (message.thinkingDisplay?.length ?? 0) >= (message.thinking?.length ?? 0)) && (
                      <span className="streaming-cursor" />
                    )}
                  </div>
                ) : isUser ? (
                  <div className="user-message-text">{message.content}</div>
                ) : null}

                {/* Error styling */}
                {message.eventType === 'error' && (
                  <div className="assistant-error">
                    <i className="fa-solid fa-circle-exclamation assistant-error__icon" />
                    <span>{message.content}</span>
                  </div>
                )}

                {/* Follow-up chips */}
                {isAssistant && message.done && message.followUps && message.followUps.length > 0 && (
                  <FollowUpChips
                    items={message.followUps}
                    onSelect={(text) => onSendWithText(text)}
                    disabled={disabled || isLoading}
                  />
                )}

                {/* Details expander */}
                {isAssistant && message.done && message.details && (
                  <details className="assistant-details">
                    <summary className="assistant-details__summary">
                      <i className="fa-solid fa-angles-right" /> More details
                    </summary>
                    <div className="assistant-details__content">
                      <MarkdownMessage content={message.details} />
                    </div>
                  </details>
                )}

                {/* Timestamp */}
                <div className="message-timestamp">
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          )
        })}
    </div>
  )
}
