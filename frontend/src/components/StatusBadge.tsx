import React from 'react'
import './StatusBadge.css'

interface StatusBadgeProps {
  status: 'streaming' | 'done' | 'error' | 'stopped' | 'thinking'
  modelKey?: string
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, modelKey }) => {
  const labels: Record<typeof status, string> = {
    streaming: 'Generating...',
    done: 'Complete',
    error: 'Error',
    stopped: 'Stopped',
    thinking: 'Thinking...',
  }

  const iconClass: Record<typeof status, string> = {
    streaming: 'fa-solid fa-spinner fa-spin',
    done: 'fa-solid fa-circle-check',
    error: 'fa-solid fa-circle-xmark',
    stopped: 'fa-solid fa-stop',
    thinking: 'fa-solid fa-brain',
  }

  return (
    <div className={`status-badge status-badge--${status}`}>
      <i className={`status-badge__fa ${iconClass[status]}`} />
      <span className="status-badge__label">{labels[status]}</span>
      {modelKey && modelKey !== 'auto' && (
        <span className="status-badge__model">{modelKey}</span>
      )}
    </div>
  )
}

export default StatusBadge
