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
            <i className={`fa-solid ${sidebarCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`} style={{ fontSize: '14px' }} />
          </button>
        )}
      </div>
      <nav className="sidebar-nav sidebar-nav-header">
        <button className="nav-item" onClick={onNewChat} title="New Chat">
          <span className="nav-icon">
            <i className="fa-solid fa-plus" />
          </span>
          <span className="nav-text">New Chat</span>
        </button>
        <button className="nav-item" onClick={onToggleSearch} title="Search Chat">
          <span className="nav-icon">
            <i className="fa-solid fa-magnifying-glass" />
          </span>
          <span className="nav-text">Search Chat</span>
        </button>
        <button className="nav-item" onClick={() => navigate('/agent/pentest-runner')} title="Pentest Job Runner" data-tour="pentest-runner">
          <span className="nav-icon">
            <i className="fa-solid fa-crosshairs" />
          </span>
          <span className="nav-text">Pentest Runner</span>
        </button>
        <button className="nav-item" onClick={onShowReport} title="Security Reports" data-tour="report-button">
          <span className="nav-icon">
            <i className="fa-solid fa-file-shield" />
          </span>
          <span className="nav-text">Report</span>
        </button>
        <button className="nav-item" onClick={onShowHacktivity} title="Hacktivity" data-tour="hacktivity-button">
          <span className="nav-icon">
            <i className="fa-solid fa-chart-mixed" />
          </span>
          <span className="nav-text">Hacktivity</span>
        </button>
        <button className="nav-item" onClick={onShowPlan} title="Plan & Usage">
          <span className="nav-icon">
            <i className="fa-solid fa-layer-group" />
          </span>
          <span className="nav-text">Plan</span>
        </button>
        <button className="nav-item" onClick={onShowCurrentPentest} title="Current Pentest – monitor running scan status">
          <span className="nav-icon">
            <i className="fa-solid fa-satellite-dish" />
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
