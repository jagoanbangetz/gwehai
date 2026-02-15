import React, { useRef, useEffect } from 'react'
import './recent-steps-terminal.css'

/**
 * Ubuntu-style terminal UI for displaying recent steps.
 *
 * Example usage:
 *   <RecentStepsTerminal
 *     title="[Nexus] Planning next plan..."
 *     steps={['[Phantom] Running: Running tools...', '[Phantom] Done']}
 *     height={280}
 *   />
 */
function RecentStepsTerminal({ title = '', steps = [], height = 280, isStreaming = false, embedded = false }) {
  const bodyRef = useRef(null)

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [steps.length])

  const heightStyle = height != null
    ? (typeof height === 'number' ? { height: `${height}px` } : { height })
    : { height: '50vh' }

  const lastIndex = steps.length - 1
  const lineClass = (i) => {
    if (steps.length === 0) return 'recent-steps-terminal__line'
    const isLast = i === lastIndex
    if (isStreaming && isLast) return 'recent-steps-terminal__line recent-steps-terminal__line--running'
    return 'recent-steps-terminal__line recent-steps-terminal__line--finished'
  }

  const body = (
    <div className="recent-steps-terminal__body" ref={bodyRef}>
      {!embedded && <div className="recent-steps-terminal__section-label">RECENT STEPS</div>}
      {steps.map((line, i) => (
        <div key={`${i}-${line}`} className={lineClass(i)}>
          $ {line}
        </div>
      ))}
      <div className="recent-steps-terminal__prompt">
        <span className="recent-steps-terminal__prompt-char">$</span>
        <span className="recent-steps-terminal__cursor" aria-hidden>▋</span>
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div className="recent-steps-terminal recent-steps-terminal--embedded" style={heightStyle}>
        {body}
      </div>
    )
  }

  return (
    <div className="recent-steps-terminal" style={heightStyle}>
      <header className="recent-steps-terminal__header">
        <div className="recent-steps-terminal__traffic">
          <span className="recent-steps-terminal__traffic-dot recent-steps-terminal__traffic-dot--red" aria-hidden />
          <span className="recent-steps-terminal__traffic-dot recent-steps-terminal__traffic-dot--yellow" aria-hidden />
          <span className="recent-steps-terminal__traffic-dot recent-steps-terminal__traffic-dot--green" aria-hidden />
        </div>
        <div className="recent-steps-terminal__title">{title || 'Terminal'}</div>
        <div className="recent-steps-terminal__traffic recent-steps-terminal__traffic--spacer" aria-hidden />
      </header>
      {body}
    </div>
  )
}

export default RecentStepsTerminal
