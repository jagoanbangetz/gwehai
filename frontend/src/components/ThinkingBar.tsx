import React, { useState } from 'react'
import RecentStepsTerminal from './RecentStepsTerminal'
import './ThinkingBar.css'

export interface ChecklistProgress {
  phase: string
  checklist: Record<string, boolean>
}

export interface ThinkingBarProps {
  /** Current step label (e.g. "Running: curl...") */
  currentStep?: string | null
  /** Recent steps for expandable list */
  steps?: string[]
  /** True when streaming; bar is visible and can show "Thinking..." */
  isStreaming?: boolean
  /** Pentest checklist progress (phase + section completion) to show in expanded view */
  checklistProgress?: ChecklistProgress | null
  /** Optional class name */
  className?: string
}

const CHECKLIST_LABELS: Record<string, string> = {
  recon: 'Recon',
  input_handling: 'Input handling',
  auth_session: 'Auth & session',
  access_control: 'Access control',
  business_logic: 'Business logic',
  other: 'Other',
}

const ThinkingBar: React.FC<ThinkingBarProps> = ({
  currentStep = null,
  steps = [],
  isStreaming = false,
  checklistProgress = null,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(false)
  const hasChecklist = checklistProgress && Object.keys(checklistProgress.checklist ?? {}).length > 0
  const displayStep = currentStep || (isStreaming ? 'Thinking...' : (hasChecklist ? 'Checklist' : ''))
  const hasSteps = steps.length > 0
  const showBar = isStreaming || displayStep || hasSteps || hasChecklist

  if (!showBar) return null

  return (
    <div className={`thinking-bar ${expanded ? 'thinking-bar--expanded' : ''} ${className}`.trim()}>
      <button
        type="button"
        className="thinking-bar__trigger"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse steps' : 'Expand recent steps and checklist'}
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
      {expanded && (hasChecklist || hasSteps) && (
        <div className="thinking-bar__content">
          <div className="thinking-bar-terminal">
            <header className="thinking-bar-terminal__header">
              <div className="thinking-bar-terminal__traffic">
                <span className="thinking-bar-terminal__dot thinking-bar-terminal__dot--red" aria-hidden />
                <span className="thinking-bar-terminal__dot thinking-bar-terminal__dot--yellow" aria-hidden />
                <span className="thinking-bar-terminal__dot thinking-bar-terminal__dot--green" aria-hidden />
              </div>
              <div className="thinking-bar-terminal__title">Checklist</div>
              <div className="thinking-bar-terminal__traffic thinking-bar-terminal__traffic--spacer" aria-hidden />
            </header>
            <div className="thinking-bar-terminal__body">
              {hasChecklist && (
                <>
                  <div className="thinking-bar-terminal__section-label">CHECKLIST PROGRESS</div>
                  <div className="thinking-bar-terminal__phase">Phase: {checklistProgress!.phase}</div>
                  <div className="thinking-bar-terminal__checklist-items">
                    {Object.entries(checklistProgress!.checklist).map(([key, done]) => (
                      <span
                        key={key}
                        className={`thinking-bar-terminal__checklist-item ${done ? 'thinking-bar-terminal__checklist-item--done' : 'thinking-bar-terminal__checklist-item--pending'}`}
                        title={done ? 'Done' : 'Pending'}
                      >
                        {done ? '✓' : '○'} {CHECKLIST_LABELS[key] ?? key}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {hasSteps && (
                <>
                  <div className="thinking-bar-terminal__section-label thinking-bar-terminal__section-label--steps">
                    [Nexus] Checklist
                  </div>
                  <RecentStepsTerminal
                    title=""
                    steps={steps.slice(-16)}
                    height="50vh"
                    isStreaming={isStreaming}
                    embedded
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ThinkingBar
