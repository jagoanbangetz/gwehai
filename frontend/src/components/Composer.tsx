import React from 'react'
import './ChatLayout.css'

export interface ComposerProps {
  children: React.ReactNode
}

/**
 * Sticky composer at bottom of chat (input area).
 * Always visible; does not scroll with messages.
 */
const Composer: React.FC<ComposerProps> = ({ children }) => {
  return <div className="composer">{children}</div>
}

export default Composer
