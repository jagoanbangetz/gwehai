import MarkdownMessage from '../../../components/MarkdownMessage'
import FollowUpChips from '../../../components/FollowUpChips'
import ThinkingBar from '../../../components/ThinkingBar'
import { GwehLogRenderer } from '../../../components/GwehLog'
import { getModelLabel } from '../../../components/ModelPicker'
import type { Message, ToolState } from '../types'
import type { LogEvent } from '../../../components/GwehLog'

interface ChatMessagesProps {
  messages: Message[]
  isLoading: boolean
  isSimpleConversation: boolean
  messageToolState: Record<string, ToolState>
  messageToolsSnapshot: Record<string, string[]>
  currentStep: string | null
  activityLog: string[]
  logEvents: LogEvent[]
  pentestChecklistProgress: { phase: string; phase_display?: string; current_section_display?: string | null; checklist: Record<string, boolean> } | null
  onSendWithText: (text: string) => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void
  disabled?: boolean
}

/**
 * Renders the chat messages list: user bubbles, assistant responses,
 * thinking bars, tool states, loading indicators, and checklist progress.
 */
export default function ChatMessages({
  messages,
  isLoading,
  isSimpleConversation,
  messageToolState,
  messageToolsSnapshot,
  currentStep,
  activityLog,
  logEvents,
  pentestChecklistProgress,
  onSendWithText,
  showToast,
  disabled,
}: ChatMessagesProps) {
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
                  {message.role === 'assistant' && message.modelKey && !isSimpleConversation && (
                    <span className="model-badge" title={`Model: ${getModelLabel(message.modelKey)}`}>
                      {getModelLabel(message.modelKey)}
                    </span>
                  )}
                  <div className="message-text">
                    {message.role === 'assistant' && (isStreamingThisMessage || (isLoading && !message.content)) && (
                      isSimpleConversation ? (
                        <div className="chat-simple-indicator">
                          <span className="chat-simple-indicator-text">Replying...</span>
                          <span className="chat-simple-indicator-dots">
                            <span></span><span></span><span></span>
                          </span>
                        </div>
                      ) : (
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
                      )
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
                                conversational={isSimpleConversation}
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
                            {message.role === 'assistant' && message.details && (
                              <details className="message-details-collapsible">
                                <summary>More details</summary>
                                <div className="message-details-content">
                                  <MarkdownMessage content={message.details} conversational />
                                </div>
                              </details>
                            )}
                            {message.role === 'assistant' && message.followUps && message.followUps.length > 0 && (
                              <FollowUpChips
                                items={message.followUps}
                                onSelect={onSendWithText}
                                disabled={disabled}
                              />
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
                  <div className="message-footer">
                    <div className="message-time">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {message.role === 'assistant' && (message.content || message.details) && (
                      <button
                        type="button"
                        className="message-copy-btn"
                        onClick={() => {
                          const text = [message.content, message.details].filter(Boolean).join('\n\n---\n\n')
                          navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard', 'success')).catch(() => {})
                        }}
                        title="Copy"
                      >
                        Copy
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      {isLoading && !messages.some((m) => m.role === 'assistant' && m.isStreaming) && (
        <div className="chat-message assistant chat-loading-dots" aria-hidden>
          <div className="message-content">
            <div className="message-bubble">
              {isSimpleConversation ? (
                <div className="chat-simple-indicator">
                  <span className="chat-simple-indicator-text">Replying...</span>
                  <span className="chat-simple-indicator-dots">
                    <span></span><span></span><span></span>
                  </span>
                </div>
              ) : (
                <>
                  <ThinkingBar currentStep={currentStep} steps={activityLog} isStreaming checklistProgress={pentestChecklistProgress} />
                  {logEvents.length > 0 && (
                    <GwehLogRenderer events={logEvents} compact copyableBlocks className="chat-gweh-log" />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {!isLoading && pentestChecklistProgress && !isSimpleConversation && (
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
  )
}
