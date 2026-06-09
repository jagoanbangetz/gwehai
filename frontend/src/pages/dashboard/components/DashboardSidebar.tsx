import { useNavigate } from 'react-router-dom'
import { logo } from '../../../assets/images'

interface SidebarHeaderProps {
  isMobile: boolean
  sidebarCollapsed: boolean
  onToggleCollapse: () => void
  onNewChat: () => void
  onToggleSearch: () => void
  showSearch: boolean
  searchQuery: string
  onSearchQueryChange: (q: string) => void
  onShowReport: () => void
  onShowHacktivity: () => void
  onShowPlan: () => void
  onShowCurrentPentest: () => void
}

/**
 * Sidebar header: logo, collapse button, nav items, search input.
 */
export default function SidebarHeader({
  isMobile,
  sidebarCollapsed,
  onToggleCollapse,
  onNewChat,
  onToggleSearch,
  showSearch,
  searchQuery,
  onSearchQueryChange,
  onShowReport,
  onShowHacktivity,
  onShowPlan,
  onShowCurrentPentest,
}: SidebarHeaderProps) {
  const navigate = useNavigate()

  return (
    <>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img src={logo} alt="GwehAI" className="sidebar-logo-image" />
          <span className="logo-text">Gweh</span>
          <span className="logo-badge">[AI]</span>
        </div>
        {!isMobile && (
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={onToggleCollapse}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {sidebarCollapsed ? (
                <path d="M9 18l6-6-6-6" />
              ) : (
                <path d="M15 18l-6-6 6-6" />
              )}
            </svg>
          </button>
        )}
      </div>
      <nav className="sidebar-nav sidebar-nav-header">
        <button className="nav-item" onClick={onNewChat} title="New Chat">
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </span>
          <span className="nav-text">New Chat</span>
        </button>
        <button className="nav-item" onClick={onToggleSearch} title="Search Chat">
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </span>
          <span className="nav-text">Search Chat</span>
        </button>
        <button className="nav-item" onClick={() => navigate('/agent/pentest-runner')} title="Pentest Job Runner" data-tour="pentest-runner">
          <span className="nav-icon">&#9876;</span>
          <span className="nav-text">Pentest Runner</span>
        </button>
        <button className="nav-item" onClick={onShowReport} title="Security Reports" data-tour="report-button">
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </span>
          <span className="nav-text">Report</span>
        </button>
        <button className="nav-item" onClick={onShowHacktivity} title="Hacktivity" data-tour="hacktivity-button">
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </span>
          <span className="nav-text">Hacktivity</span>
        </button>
        <button className="nav-item" onClick={onShowPlan} title="Plan & Usage">
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </span>
          <span className="nav-text">Plan</span>
        </button>
        <button className="nav-item" onClick={onShowCurrentPentest} title="Current Pentest – monitor running scan status">
          <span className="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </span>
          <span className="nav-text">Current Pentest</span>
        </button>
        {showSearch && (
          <div className="sidebar-search">
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="search-input"
              autoFocus
            />
          </div>
        )}
      </nav>
    </>
  )
}
