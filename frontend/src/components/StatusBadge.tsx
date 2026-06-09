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

  const icons: Record<typeof status, string> = {
    streaming: '◉',
    done: '✓',
    error: '✕',
    stopped: '■',
    thinking: '◎',
  }

  return (
    <div className={`status-badge status-badge--${status}`}>
      <span className="status-badge__icon">{icons[status]}</span>
      <span className="status-badge__label">{labels[status]}</span>
      {modelKey && modelKey !== 'auto' && (
        <span className="status-badge__model">{modelKey}</span>
      )}
    </div>
  )
}

export default StatusBadge
