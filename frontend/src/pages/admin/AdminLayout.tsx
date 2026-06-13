import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import './Admin.css'

type NavItem = { path: string; label: string }
type NavGroup = { id: string; label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [{ path: '/admin/overview', label: 'Overview' }],
  },
  {
    id: 'content',
    label: 'Content',
    items: [
      { path: '/admin/users', label: 'Users' },
      { path: '/admin/conversations', label: 'Conversations' },
      { path: '/admin/hacktivity', label: 'Hacktivity' },
      { path: '/admin/reports', label: 'Reports' },
      { path: '/admin/contact', label: 'Contact Inbox' },
      { path: '/admin/promotion', label: 'Promotion' },
    ],
  },
  {
    id: 'payment',
    label: 'Payment',
    items: [
      { path: '/admin/billing', label: 'Billing & pricing' },
      { path: '/admin/payment/subscriptions', label: 'Subscriptions' },
      { path: '/admin/payment/plans', label: 'Plan actions' },
    ],
  },
  {
    id: 'usage',
    label: 'Usage & optimization',
    items: [
      { path: '/admin/usage', label: 'Usage & plans' },
      { path: '/admin/cost-center', label: 'Cost Center' },
      { path: '/admin/abuse-center', label: 'Abuse Center' },
      { path: '/admin/ops-console', label: 'Ops Console' },
      { path: '/admin/guardrails', label: 'Guardrails' },
      { path: '/admin/margin', label: 'Margin & Revenue' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { path: '/admin/system', label: 'System' },
      { path: '/admin/settings', label: 'Settings' },
      { path: '/admin/audit', label: 'Audit' },
      { path: '/admin/models', label: 'Models' },
    ],
  },
]

function getGroupForPath(path: string): string {
  for (const g of NAV_GROUPS) {
    if (g.items.some((i) => i.path === path || (path.startsWith(i.path) && i.path !== '/admin/overview'))) return g.id
    if (path === '/admin' || path === '/admin/') return 'overview'
  }
  if (path.startsWith('/admin/payment/')) return 'payment'
  return 'overview'
}

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const path = location.pathname

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const g = getGroupForPath(path)
    return new Set([g])
  })

  useEffect(() => {
    const g = getGroupForPath(path)
    setOpenGroups((prev) => new Set(prev).add(g))
  }, [path])

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <h1 className="admin-sidebar-title">Admin</h1>
          <span className="admin-sidebar-badge">secure</span>
        </div>
        <nav className="admin-nav admin-nav-tree">
          {NAV_GROUPS.map((group) => {
            const isOpen = openGroups.has(group.id)
            const isSingle = group.items.length === 1 && group.items[0].path === '/admin/overview'
            return (
              <div key={group.id} className="admin-nav-group">
                <button
                  type="button"
                  className="admin-nav-group-btn"
                  onClick={() => !isSingle && toggleGroup(group.id)}
                  aria-expanded={isSingle ? undefined : isOpen}
                >
                  <span className="admin-nav-group-label">{group.label}</span>
                  {!isSingle && (
                    <span className="admin-nav-group-chevron" aria-hidden>
                      {isOpen ? '▼' : '▶'}
                    </span>
                  )}
                </button>
                {(isSingle || isOpen) && (
                  <div className="admin-nav-group-items">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
                        end={item.path === '/admin/overview'}
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
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
