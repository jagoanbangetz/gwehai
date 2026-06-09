import React from 'react'
import './ProgressIndicator.css'

export type ProgressState = 'idle' | 'thinking' | 'generating' | 'done' | 'stopping' | 'stopped' | 'error'

interface ProgressIndicatorProps {
  state: ProgressState
  currentStep?: string | null
  activityLog?: string[]
  onStop?: () => void
}

const STATE_LABELS: Record<ProgressState, string> = {
  idle: 'Ready',
  thinking: 'Analyzing your request...',
  generating: 'Generating response...',
  done: 'Complete',
  stopping: 'Stopping...',
  stopped: 'Stopped by user',
  error: 'Error occurred',
}

const STATE_ICONS: Record<ProgressState, string> = {
  idle: '◉',
  thinking: '◎',
  generating: '◈',
  done: '✓',
  stopping: '◌',
  stopped: '■',
  error: '✕',
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  state,
  currentStep,
  activityLog = [],
  onStop,
}) => {
  if (state === 'idle') return null

  const isActive = state === 'thinking' || state === 'generating'
  const label = currentStep || STATE_LABELS[state]

  return (
    <div className={`progress-indicator progress-indicator--${state}`}>
      <div className="progress-indicator__header">
        <div className="progress-indicator__status">
          <span className={`progress-indicator__icon ${isActive ? 'progress-indicator__icon--pulse' : ''}`}>
            {STATE_ICONS[state]}
          </span>
          <span className="progress-indicator__label">{label}</span>
        </div>
        {isActive && onStop && (
          <button
            type="button"
            className="progress-indicator__stop"
            onClick={onStop}
            title="Stop generation"
          >
            <span className="progress-indicator__stop-icon">■</span>
            <span>Stop</span>
          </button>
        )}
      </div>

      {/* Animated progress bar */}
      {isActive && (
        <div className="progress-indicator__bar-track">
          <div className="progress-indicator__bar-fill" />
        </div>
      )}

      {/* Recent activity log */}
      {activityLog.length > 0 && isActive && (
        <div className="progress-indicator__activity">
          {activityLog.slice(-3).map((entry, i) => (
            <div key={i} className="progress-indicator__activity-entry">
              <span className="progress-indicator__activity-dot" />
              <span className="progress-indicator__activity-text">{entry}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ProgressIndicator
