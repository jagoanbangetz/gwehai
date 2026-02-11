import React from 'react'
import AppTopBar from './AppTopBar'
import AppSidebar from './AppSidebar'
import './DashboardLayout.css'

export interface DashboardLayoutProps {
  isSidebarOpen: boolean
  onSidebarToggle: (open?: boolean) => void
  isMobile: boolean
  /** On desktop: when true, sidebar is 72px (collapsed). */
  sidebarCollapsed?: boolean
  /** On desktop: when true, main chat panel is hidden (flex: 0, width: 0). */
  chatCollapsed?: boolean
  /** Callback to expand chat (e.g. from floating restore button). */
  onChatCollapseToggle?: (collapsed?: boolean) => void
  sidebarHeader: React.ReactNode
  sidebarList: React.ReactNode
  sidebarFooter: React.ReactNode
  mainContent: React.ReactNode
  userEmail?: string | null
  onReportClick: () => void
  onPlanClick: () => void
}

/**
 * Wrapper: top line + sidebar (or drawer on mobile) + main (TopBar + content).
 * 2-column layout on desktop (sidebar 280px + main); full width on mobile when drawer closed.
 */
const SIDEBAR_WIDTH_EXPANDED = 280
const SIDEBAR_WIDTH_COLLAPSED = 72

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  isSidebarOpen,
  onSidebarToggle,
  isMobile,
  sidebarCollapsed = false,
  chatCollapsed = false,
  onChatCollapseToggle,
  sidebarHeader,
  sidebarList,
  sidebarFooter,
  mainContent,
  userEmail,
  onReportClick,
  onPlanClick,
}) => {
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED
  const showFloatingRestore = !isMobile && chatCollapsed && onChatCollapseToggle

  const mainWrapStyle: React.CSSProperties = chatCollapsed
    ? { flex: 0, width: 0, minWidth: 0, overflow: 'hidden', transition: 'width 180ms ease, flex 180ms ease' }
    : { flex: 1, minWidth: 0, overflow: 'hidden', transition: 'width 180ms ease, flex 180ms ease' }

  return (
    <div className="dashboard-layout">
      <div className="dashboard-top-line" aria-hidden />
      <div className="dashboard-body">
        <AppSidebar
          isOpen={isSidebarOpen}
          onClose={() => onSidebarToggle(false)}
          isMobile={isMobile}
          collapsed={sidebarCollapsed}
          header={sidebarHeader}
          footer={sidebarFooter}
        >
          {sidebarList}
        </AppSidebar>
        <div
          className={`dashboard-main-wrap ${chatCollapsed ? 'dashboard-main-wrap-collapsed' : ''}`}
          style={mainWrapStyle}
        >
          <AppTopBar
            onMenuClick={() => onSidebarToggle()}
            isMenuOpen={isSidebarOpen}
            onReportClick={onReportClick}
            onPlanClick={onPlanClick}
            onProfileClick={() => onSidebarToggle(true)}
            userEmail={userEmail}
            mobileLayout={isMobile}
          />
          <div className="dashboard-main-content">{mainContent}</div>
        </div>
      </div>

      {showFloatingRestore && (
        <button
          type="button"
          className="dashboard-restore-chat"
          onClick={() => onChatCollapseToggle?.(false)}
          style={{ left: sidebarWidth + 12 }}
          aria-label="Restore chat"
          title="Restore chat"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 5H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V7" />
            <path d="M16 2h4v4M20 2l-7 7" />
          </svg>
          <span className="dashboard-restore-chat-label">Restore chat</span>
        </button>
      )}
    </div>
  )
}

export default DashboardLayout
