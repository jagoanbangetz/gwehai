import type { RefObject } from 'react'
import type { Message } from '../types'

interface Props {
  messages: Message[]
  input: string
  isLoading: boolean
  messagesEndRef: RefObject<HTMLDivElement>
  onInputChange: (value: string) => void
  onSend: () => void
  onClose: () => void
}

export default function HelpModal({ messages, input, isLoading, messagesEndRef, onInputChange, onSend, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Help & Support</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="modal-body help-modal-body">
          <div className="help-chat-container">
            <div className="help-messages">
              {messages.length === 0 ? (
                <div className="help-empty">
                  <p>How can I help you today?</p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={`help-message ${msg.role}`}>
                    <div className="help-message-content">{msg.content}</div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="help-message assistant">
                  <div className="help-message-content">
                    <span className="typing-indicator">
                      <span></span><span></span><span></span>
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="help-input-container">
              <input
                type="text"
                className="help-input"
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !isLoading && input.trim()) {
                    onSend()
                  }
                }}
                placeholder="Ask a question..."
              />
              <button
                className="help-send-button"
                onClick={onSend}
                disabled={isLoading || !input.trim()}
              >
                {isLoading ? '...' : '>'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
