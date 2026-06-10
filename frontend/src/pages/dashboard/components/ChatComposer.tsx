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
              +
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
                    <i className="fa-solid fa-microphone" />
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
                    <i className="fa-solid fa-paper-plane" />
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
