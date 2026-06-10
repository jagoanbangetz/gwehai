import React, { useRef, useEffect } from 'react'
import './ProfileFooter.css'

function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.substring(0, 2).toUpperCase()
  }
  if (email) return email.substring(0, 2).toUpperCase()
  return '?'
}

export interface ProfileFooterProps {
  /** Display name (e.g. "galehrizky galehrizky") */
  name: string
  /** Optional email for initials when name is empty */
  email?: string
  /** Plan label shown below name (e.g. "Plus") */
  planLabel: string
  /** When true, show only centered avatar and tooltip */
  collapsed?: boolean
  onUpgrade: () => void
  onSettings: () => void
  onHelp: () => void
  onLogout: () => void
  onRestartTour?: () => void
}

const ProfileFooter: React.FC<ProfileFooterProps> = ({
  name,
  email,
  planLabel,
  collapsed = false,
  onUpgrade,
  onSettings,
  onHelp,
  onLogout,
  onRestartTour,
}) => {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const displayName = name || email || 'User'
  const initials = getInitials(name || undefined, email)
  const tooltipText = `${displayName}\n${planLabel}`

  const handleRowClick = () => {
    setMenuOpen((prev) => !prev)
  }

  const runAndClose = (fn: () => void) => {
    fn()
    setMenuOpen(false)
  }

  return (
    <div className="profile-footer-wrap" ref={containerRef}>
      <button
        type="button"
        className={`profile-footer-row ${collapsed ? 'profile-footer-row--collapsed' : ''}`}
        onClick={handleRowClick}
        title={collapsed ? tooltipText : undefined}
        aria-expanded={menuOpen}
        aria-haspopup="true"
      >
        <div className="profile-footer-avatar" aria-hidden>
          {initials}
        </div>
        {!collapsed && (
          <div className="profile-footer-text">
            <span className="profile-footer-name">{displayName}</span>
            <span className="profile-footer-plan">{planLabel}</span>
          </div>
        )}
      </button>

      {menuOpen && (
        <div className="profile-footer-dropdown" role="menu">
          <button type="button" className="profile-footer-menu-item" onClick={() => runAndClose(onUpgrade)} role="menuitem">
            <span className="profile-footer-menu-icon">
              <i className="fa-solid fa-layer-group" />
            </span>
            Upgrade Plan
          </button>
          <button type="button" className="profile-footer-menu-item" onClick={() => runAndClose(onSettings)} role="menuitem">
            <span className="profile-footer-menu-icon">
              <i className="fa-solid fa-gear" />
            </span>
            Settings
          </button>
          <button type="button" className="profile-footer-menu-item" onClick={() => runAndClose(onHelp)} role="menuitem">
            <span className="profile-footer-menu-icon">
              <i className="fa-solid fa-circle-question" />
            </span>
            Help
          </button>
          {onRestartTour && (
            <button type="button" className="profile-footer-menu-item" onClick={() => runAndClose(onRestartTour)} role="menuitem">
              <span className="profile-footer-menu-icon">
                <i className="fa-solid fa-rotate-right" />
              </span>
              Restart Tour
            </button>
          )}
          <div className="profile-footer-menu-divider" />
          <button type="button" className="profile-footer-menu-item" onClick={() => runAndClose(onLogout)} role="menuitem">
            <span className="profile-footer-menu-icon">
              <i className="fa-solid fa-right-from-bracket" />
            </span>
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

export default ProfileFooter
