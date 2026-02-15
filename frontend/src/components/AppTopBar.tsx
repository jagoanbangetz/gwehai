import React from 'react'
import './AppTopBar.css'

export interface AppTopBarProps {
  onMenuClick: () => void
  isMenuOpen?: boolean
  onProfileClick: () => void
  userEmail?: string | null
  /** Show hamburger + mobile title + icon buttons (true on mobile/tablet) */
  mobileLayout?: boolean
}

/**
 * ChatGPT-style TopBar: hamburger pinned top-left (12px/8px), title viewport-centered, right icons pinned top-right.
 * Uses position:absolute for exact pinning; container has position:relative and no padding that would shift items.
 */
const AppTopBar: React.FC<AppTopBarProps> = ({
  onMenuClick,
  isMenuOpen = false,
  onProfileClick,
  userEmail,
  mobileLayout = false,
}) => {
  return (
    <header className="app-topbar" role="banner">
      {/* Hamburger only on mobile: toggles drawer. Hidden entirely on desktop. */}
      {mobileLayout && (
        <button
          type="button"
          className="app-topbar-hamburger"
          onClick={onMenuClick}
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isMenuOpen}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isMenuOpen ? (
              <path d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path d="M3 12h18M3 6h18M3 18h18" />
            )}
          </svg>
        </button>
      )}

      <div className="app-topbar-title">
        <span className="app-topbar-title-text">GwehAI</span>
        {mobileLayout && (
          <span className="app-topbar-title-chevron" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        )}
      </div>

      <div className="app-topbar-right">
        {!mobileLayout && userEmail && (
          <span className="app-topbar-email">{userEmail}</span>
        )}
      </div>
    </header>
  )
}

export default AppTopBar
