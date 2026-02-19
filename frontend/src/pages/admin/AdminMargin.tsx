import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

interface MarginSummary {
  totalRevenue: string
  totalAiCost: string
  grossMarginPct: string
  avgCostPerUser: string
}

interface MarginUserRow {
  user: string
  userId: string
  plan: string
  revenue: string
  aiCost: string
  marginPct: string
  activeSince: string | null
}

export default function AdminMargin() {
  const [summary, setSummary] = useState<MarginSummary | null>(null)
  const [users, setUsers] = useState<MarginUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const limit = 25

  useEffect(() => {
    const load = async () => {
      try {
        setError(null)
        const [sumRes, usersRes] = await Promise.all([
          apiClient.get('/admin/margin/summary'),
          apiClient.get(`/admin/margin/users?limit=${limit}&offset=${page * limit}`),
        ])
        setSummary(sumRes.data)
        setUsers(usersRes.data.items ?? [])
        setTotal(usersRes.data.total ?? 0)
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [page])

  if (loading && !summary) return <div className="admin-loading">Loading margin…</div>
  if (error && !summary) return <div className="admin-error">{error}</div>

  return (
    <>
      <h2 className="admin-page-title">Margin & Revenue</h2>
      {error && <div className="admin-error">{error}</div>}
      {summary && (
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <div className="admin-stat-label">Total Revenue</div>
            <div className="admin-stat-value">${summary.totalRevenue}</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">Total AI Cost</div>
            <div className="admin-stat-value">${summary.totalAiCost}</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">Gross Margin %</div>
            <div className="admin-stat-value">{summary.grossMarginPct}%</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">Avg Cost Per User</div>
            <div className="admin-stat-value">${summary.avgCostPerUser}</div>
          </div>
        </div>
      )}

      <div className="admin-card">
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Revenue vs Cost over time</h3>
        <p style={{ margin: 0, color: 'oklch(0.65 0 0)', fontSize: '0.9rem' }}>Line chart placeholder — connect to time-series endpoint when available.</p>
      </div>

      <div className="admin-card">
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>By user</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Plan</th>
                <th>Revenue</th>
                <th>AI Cost</th>
                <th>Margin %</th>
                <th>Active Since</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr key={row.userId}>
                  <td>{row.user || row.userId}</td>
                  <td>{row.plan}</td>
                  <td>${row.revenue}</td>
                  <td>${row.aiCost}</td>
                  <td>{row.marginPct}%</td>
                  <td>{row.activeSince ? new Date(row.activeSince).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total > limit && (
          <div className="admin-page-controls">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span>Page {page + 1} · Total {total}</span>
            <button type="button" disabled={(page + 1) * limit >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </div>
    </>
  )
}
