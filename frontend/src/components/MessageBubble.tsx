import React from 'react'
import './ChatLayout.css'

export interface MessageBubbleProps {
  /** 'user' | 'assistant' for alignment and styling */
  role: 'user' | 'assistant'
  children: React.ReactNode
  className?: string
}

/**
 * Chat message bubble: max-width, padding, border-radius.
 * Long text wraps; code blocks scroll horizontally.
 */
const MessageBubble: React.FC<MessageBubbleProps> = ({ role, children, className = '' }) => {
  return (
    <div className={`message-bubble message-bubble--${role} ${className}`.trim()} role="article">
      {children}
    </div>
  )
}

export default MessageBubble
