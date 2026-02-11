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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </span>
            Upgrade Plan
          </button>
          <button type="button" className="profile-footer-menu-item" onClick={() => runAndClose(onSettings)} role="menuitem">
            <span className="profile-footer-menu-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24" />
              </svg>
            </span>
            Settings
          </button>
          <button type="button" className="profile-footer-menu-item" onClick={() => runAndClose(onHelp)} role="menuitem">
            <span className="profile-footer-menu-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
              </svg>
            </span>
            Help
          </button>
          <div className="profile-footer-menu-divider" />
          <button type="button" className="profile-footer-menu-item" onClick={() => runAndClose(onLogout)} role="menuitem">
            <span className="profile-footer-menu-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </span>
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

export default ProfileFooter
