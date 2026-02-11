import React from 'react'
import './AppSidebar.css'

export interface AppSidebarProps {
  /** Whether sidebar is open. On desktop, sidebar is always visible; on mobile, controls drawer. */
  isOpen: boolean
  /** Callback when sidebar should close (e.g. overlay click or close on mobile after selection). */
  onClose: () => void
  /** True when viewport is mobile/tablet — sidebar becomes a sliding drawer. */
  isMobile: boolean
  /** On desktop: when true, sidebar is 72px wide and footer shows avatar only. */
  collapsed?: boolean
  /** Sticky top area (e.g. New chat, Search). */
  header: React.ReactNode
  /** Scrollable middle (conversation list). */
  children: React.ReactNode
  /** Sticky bottom area (e.g. ProfileFooter). */
  footer: React.ReactNode
}

/**
 * Left sidebar: ChatGPT-style layout.
 * - Full viewport height (100vh).
 * - Header (logo + new chat + search) sticky at top.
 * - Middle (menu items + chat history list) is the ONLY scrollable region.
 * - Footer (user + settings) sticky at bottom.
 * - Custom thin scrollbar inside the scroll area; main page does not scroll.
 */
const AppSidebar: React.FC<AppSidebarProps> = ({
  isOpen,
  onClose,
  isMobile,
  collapsed = false,
  header,
  children,
  footer,
}) => {
  const desktopClass = isMobile ? '' : collapsed ? 'app-sidebar-desktop app-sidebar-desktop-collapsed' : 'app-sidebar-desktop'
  const sidebarContent = (
    <div className="sidebar">
      <div className="sidebarHeader">{header}</div>
      <div className="sidebarScroll">{children}</div>
      <div className={`sidebarFooter ${collapsed ? 'sidebar-footer-collapsed' : ''}`}>{footer}</div>
    </div>
  )

  if (isMobile) {
    return (
      <>
        <div
          className={`app-sidebar-overlay ${isOpen ? 'app-sidebar-overlay-open' : ''}`}
          onClick={onClose}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          role="button"
          tabIndex={-1}
          aria-hidden={!isOpen}
        />
        <aside
          className={`app-sidebar app-sidebar-drawer ${isOpen ? 'app-sidebar-drawer-open' : ''}`}
          aria-label="Chat history"
        >
          {sidebarContent}
        </aside>
      </>
    )
  }

  return (
    <aside className={`app-sidebar ${desktopClass}`} aria-label="Chat history">
      {sidebarContent}
    </aside>
  )
}

export default AppSidebar
