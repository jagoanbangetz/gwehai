import React from 'react'
import './ChatLayout.css'

export interface ChatLayoutProps {
  /** Optional top section (e.g. logo + suggestions when empty). */
  topContent?: React.ReactNode
  /** Scrollable messages area (MessagesArea). */
  children: React.ReactNode
  /** Sticky composer at bottom (Composer). */
  composer: React.ReactNode
}

/**
 * ChatGPT-style chat page: full height, 3-part vertical layout.
 * Only the middle (children) scrolls; composer stays at bottom.
 */
const ChatLayout: React.FC<ChatLayoutProps> = ({ topContent, children, composer }) => {
  return (
    <div className="chat-page">
      {topContent != null && <div className="chat-page__top">{topContent}</div>}
      <div className="chat-page__messages">{children}</div>
      <div className="chat-page__composer">{composer}</div>
    </div>
  )
}

export default ChatLayout
