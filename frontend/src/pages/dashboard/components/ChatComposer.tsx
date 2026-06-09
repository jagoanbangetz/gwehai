import Composer from '../../../components/Composer'
import ModelPicker from '../../../components/ModelPicker'
import type { ModelKey } from '../../../components/ModelPicker'

interface ChatComposerProps {
  // Mode
  chatMode: 'agent' | 'ask'
  onChatModeChange: (mode: 'agent' | 'ask') => void
  // Model
  selectedModelKey: ModelKey
  onModelChange: (key: ModelKey, modelId?: string | null) => void
  effectivePlanId: string
  isLoading: boolean
  // Input
  input: string
  onInputChange: (val: string) => void
  inputRef: React.RefObject<HTMLTextAreaElement>,
  onSend: () => void
  onStop: () => void
  onKeyPress: (e: React.KeyboardEvent) => void
  // Voice
  isVoiceRecording: boolean
  voiceTranscript: string
  onStartVoice: () => void
  onCancelVoice: () => void
  onConfirmVoice: () => void
  // Limits
  atScanLimit: boolean
  scanLimitInfo?: { sessions_started_today: number; sessions_per_day: number }
  onViewPlans: () => void
}

/**
 * Chat input area: mode selector, model picker, voice input, text input, send/stop.
 * AI builder style: clean, modern, prominent stop button.
 */
export default function ChatComposer({
  chatMode,
  onChatModeChange,
  selectedModelKey,
  onModelChange,
  effectivePlanId,
  isLoading,
  input,
  onInputChange,
  inputRef,
  onSend,
  onStop,
  onKeyPress,
  isVoiceRecording,
  voiceTranscript,
  onStartVoice,
  onCancelVoice,
  onConfirmVoice,
  atScanLimit,
  scanLimitInfo,
  onViewPlans,
}: ChatComposerProps) {
  return (
    <Composer>
      {atScanLimit && (
        <div className="chat-scan-limit-banner" role="alert">
          <span>
            You've used your {scanLimitInfo?.sessions_started_today ?? 0}/
            {scanLimitInfo?.sessions_per_day ?? 0} scans for today. Upgrade for more.
          </span>
          <button type="button" className="chat-scan-limit-upgrade" onClick={onViewPlans}>
            View plans
          </button>
        </div>
      )}
      <div className="chat-input-row">
        <div className="chat-mode-selector" role="group" aria-label="Chat mode" data-tour="chat-mode">
          <button
            type="button"
            className={`chat-mode-btn ${chatMode === 'agent' ? 'active' : ''}`}
            onClick={() => {
              onChatModeChange('agent')
              try { localStorage.setItem('gwehai_chat_mode', 'agent') } catch (_) {}
            }}
            title="Full agent: pentest, tools, step-by-step"
          >
            <span className="chat-mode-icon" aria-hidden><i className="chat-mode-icon-agent">⚡</i></span>
            <span className="chat-mode-label">Agent</span>
          </button>
          <button
            type="button"
            className={`chat-mode-btn ${chatMode === 'ask' ? 'active' : ''}`}
            onClick={() => {
              onChatModeChange('ask')
              try { localStorage.setItem('gwehai_chat_mode', 'ask') } catch (_) {}
            }}
            title="Quick ask: fast answers, no tools"
          >
            <span className="chat-mode-icon" aria-hidden><i className="chat-mode-icon-ask">💬</i></span>
            <span className="chat-mode-label">Ask</span>
          </button>
        </div>
        <div className="chat-model-picker" data-tour="model-picker">
          <ModelPicker
            value={selectedModelKey}
            onChange={(key, modelId) => onModelChange(key, modelId ?? null)}
            planId={effectivePlanId}
          />
        </div>
      </div>
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
                  <span>{voiceTranscript || 'Listening...'}</span>
                </div>
                <div className="voice-actions">
                  <button type="button" className="voice-action-btn cancel" onClick={onCancelVoice} title="Cancel">✕</button>
                  <button type="button" className="voice-action-btn confirm" onClick={onConfirmVoice} disabled={!voiceTranscript} title="Use transcript">✓</button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="input-container">
            <button type="button" className="input-attach" title="Attach file (coming soon)" disabled>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder={isLoading ? 'AI is working...' : 'Ask GwehAI anything...'}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyPress={onKeyPress}
              rows={1}
              disabled={isLoading}
              aria-label="Chat input"
              data-tour="chat-input"
            />
            <div className="input-actions">
              {isLoading ? (
                <button
                  type="button"
                  className="input-stop"
                  onClick={onStop}
                  title="Stop generation"
                  aria-label="Stop generation"
                >
                  <span className="input-stop__icon">■</span>
                  <span className="input-stop__label">Stop</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="input-voice"
                    onClick={onStartVoice}
                    title="Voice input"
                    aria-label="Voice input"
                    disabled={!input.length && false}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                      <path d="M19 10v2a7 7 0 01-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="input-send"
                    onClick={onSend}
                    disabled={!input.trim()}
                    title="Send message (Enter)"
                    aria-label="Send message"
                    data-tour="send-button"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Composer>
  )
}
