import React from 'react'
import './FollowUpChips.css'

export interface FollowUpChipsProps {
  items: string[]
  onSelect: (text: string) => void
  disabled?: boolean
}

/**
 * Quick follow-up suggestion chips under an assistant message. Clicking a chip sends that text.
 */
const FollowUpChips: React.FC<FollowUpChipsProps> = ({ items, onSelect, disabled }) => {
  if (!items?.length) return null
  return (
    <div className="follow-up-chips" role="group" aria-label="Suggested follow-ups">
      {items.map((label, i) => (
        <button
          key={i}
          type="button"
          className="follow-up-chip"
          onClick={() => onSelect(label)}
          disabled={disabled}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export default FollowUpChips
