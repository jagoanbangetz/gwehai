import { useEffect, useState } from 'react'
import apiClient from '../utils/api'
import './Dashboard.css'
import { useAuth } from '../context/AuthContext'
import PageLoader from '../components/PageLoader'

interface AdminSummary {
  users: number
  admins: number
  aiAgents: number
  payments: number
  reports: number
}

const AdminDashboard = () => {
  const { user } = useAuth()
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await apiClient.get('/admin/dashboard')
        setSummary(res.data)
      } catch (err: any) {
        console.error('Failed to load admin dashboard', err)
        setError(err.response?.data?.message || 'Failed to load admin dashboard')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (!user) return null

  return (
    <PageLoader>
    <div className="dashboard-main admin-dashboard">
      <header className="dashboard-header">
        <div className="header-nav">
          <span className="header-link">Admin Dashboard</span>
        </div>
        <div className="header-actions">
          <span className="user-email">{user.email}</span>
        </div>
      </header>

      <main className="dashboard-chat">
        {loading && <p>Loading admin metrics...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {summary && (
          <div className="usage-stats">
            <div className="usage-stat-card">
              <div className="stat-label">Users</div>
              <div className="stat-value">{summary.users}</div>
            </div>
            <div className="usage-stat-card">
              <div className="stat-label">Admins</div>
              <div className="stat-value">{summary.admins}</div>
            </div>
            <div className="usage-stat-card">
              <div className="stat-label">AI Agents</div>
              <div className="stat-value">{summary.aiAgents}</div>
            </div>
            <div className="usage-stat-card">
              <div className="stat-label">Payments</div>
              <div className="stat-value">{summary.payments}</div>
            </div>
            <div className="usage-stat-card">
              <div className="stat-label">Reports</div>
              <div className="stat-value">{summary.reports}</div>
            </div>
          </div>
        )}
      </main>
    </div>
    </PageLoader>
  )
}

export default AdminDashboard

