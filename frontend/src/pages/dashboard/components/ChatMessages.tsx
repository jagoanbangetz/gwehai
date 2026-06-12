import { useState } from 'react'
import MarkdownMessage from '../../../components/MarkdownMessage'
import FollowUpChips from '../../../components/FollowUpChips'
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
  isResuming?: boolean
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
  activityLog: _activityLog_unused,
  logEvents: _logEvents,
  pentestChecklistProgress: _pentestChecklistProgress,
  onSendWithText,
  showToast: _showToast,
  onStop: _onStop,
  isResuming,
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
      {/* Resume indicator when reconnecting to a running pentest */}
      {isResuming && (
        <div className="chat-message chat-message--assistant chat-message--streaming">
          <div className="chat-message__avatar">
            <span className="chat-message__avatar-icon">G</span>
          </div>
          <div className="chat-message__content">
            <div className="chat-agent-indicator">
              <span className="chat-agent-indicator-icon">&#9881;</span>
              <span className="chat-agent-indicator-text">Resuming pentest</span>
              <span className="chat-agent-indicator-dots">
                <span /><span /><span />
              </span>
            </div>
          </div>
        </div>
      )}
      {messages
        .filter((message) => {
          if (message.role === 'user') return true
          if (message.role === 'assistant' && (message.eventType === 'planning' || message.eventType === 'thinking' || message.eventType === 'content' || message.eventType === 'executing' || message.eventType === 'planning-next')) {
            const c2 = String(message.content || "").trim(); const t2 = String(message.thinking || "").trim().length > 0; if (!c2 && !t2 && !message.isStreaming) return false; return true
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

                {/* Agent mode progress indicator */}
                {isAssistant && !isSimpleConversation && message.isStreaming && !message.done && !message.content && currentStep && (
                  <div className="chat-agent-indicator">
                    <span className="chat-agent-indicator-icon">&#9881;</span>
                    <span className="chat-agent-indicator-text">{currentStep}</span>
                    <span className="chat-agent-indicator-dots">
                      <span /><span /><span />
                    </span>
                  </div>
                )}

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