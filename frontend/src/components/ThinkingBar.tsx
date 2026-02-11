import React, { useState } from 'react'
import './ThinkingBar.css'

export interface ThinkingBarProps {
  /** Current step label (e.g. "Running: curl...") */
  currentStep?: string | null
  /** Recent steps for expandable list */
  steps?: string[]
  /** True when streaming; bar is visible and can show "Thinking..." */
  isStreaming?: boolean
  /** Optional class name */
  className?: string
}

const ThinkingBar: React.FC<ThinkingBarProps> = ({
  currentStep = null,
  steps = [],
  isStreaming = false,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(false)
  const displayStep = currentStep || (isStreaming ? 'Thinking...' : '')
  const hasSteps = steps.length > 0
  const showBar = isStreaming || displayStep || hasSteps

  if (!showBar) return null

  return (
    <div className={`thinking-bar ${expanded ? 'thinking-bar--expanded' : ''} ${className}`.trim()}>
      <button
        type="button"
        className="thinking-bar__trigger"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse steps' : 'Expand recent steps'}
      >
        <span className="thinking-bar__dots" aria-hidden>
          <span /><span /><span />
        </span>
        <span className="thinking-bar__label">{displayStep || 'Thinking...'}</span>
        <span className={`thinking-bar__chevron ${expanded ? 'thinking-bar__chevron--up' : ''}`} aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {expanded && hasSteps && (
        <div className="thinking-bar__content">
          <div className="thinking-bar__steps-label">Recent steps</div>
          <ul className="thinking-bar__steps">
            {steps.slice(-16).map((step, i) => (
              <li key={`${i}-${step}`} className="thinking-bar__step">
                {step}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default ThinkingBar
