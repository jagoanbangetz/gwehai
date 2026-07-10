import React from 'react'
import ThemeToggle from './ThemeToggle'
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
  onProfileClick: _onProfileClick,
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
          {isMenuOpen ? (
            <i className="fa-solid fa-xmark" />
          ) : (
            <i className="fa-solid fa-bars" />
          )}
        </button>
      )}

      <div className="app-topbar-title">
        <span className="app-topbar-title-text">GwehAI</span>
        {mobileLayout && (
          <span className="app-topbar-title-chevron" aria-hidden>
            <i className="fa-solid fa-chevron-down" />
          </span>
        )}
      </div>

      <div className="app-topbar-right">
        <ThemeToggle />
        {!mobileLayout && userEmail && (
          <span className="app-topbar-email">{userEmail}</span>
        )}
      </div>
    </header>
  )
}

export default AppTopBar
