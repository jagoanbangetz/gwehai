import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import './Admin.css'

const NAV = [
  { path: '/admin/overview', label: 'Overview' },
  { path: '/admin/users', label: 'Users' },
  { path: '/admin/conversations', label: 'Conversations' },
  { path: '/admin/jobs', label: 'Pentests & jobs' },
  { path: '/admin/hacktivity', label: 'Hacktivity' },
  { path: '/admin/reports', label: 'Reports' },
  { path: '/admin/usage', label: 'Usage & plans' },
  { path: '/admin/system', label: 'System' },
  { path: '/admin/audit', label: 'Audit' },
]

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <h1 className="admin-sidebar-title">Admin</h1>
          <span className="admin-sidebar-badge">secure</span>
        </div>
        <nav className="admin-nav">
          {NAV.map(({ path, label }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
              end={path === '/admin/overview'}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <span className="admin-user-email" title={user?.email ?? ''}>{user?.email ?? ''}</span>
          <button type="button" className="admin-logout" onClick={() => { logout(); navigate('/') }}>
            Log out
          </button>
          <NavLink to="/agent" className="admin-back-app">← Back to app</NavLink>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
