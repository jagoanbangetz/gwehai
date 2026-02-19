import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

interface AbuseSummary {
  suspiciousUsersToday: number
  rateLimitViolations: number
  repeatedTargetAttempts: number
  highVelocityRequests: number
}

interface AbuseEventRow {
  id: string
  user: string | null
  userId: string | null
  ip: string | null
  requestsPerMin: number
  domainsTargeted: number
  riskScore: number
  eventType: string
  createdAt: string
}

export default function AdminAbuseCenter() {
  const [summary, setSummary] = useState<AbuseSummary | null>(null)
  const [events, setEvents] = useState<AbuseEventRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const limit = 25
  const [actionModal, setActionModal] = useState<{ userId: string; email?: string } | null>(null)
  const [actionType, setActionType] = useState<'throttle' | 'suspend' | 'ban'>('throttle')
  const [actionReason, setActionReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadSummary = async () => {
    try {
      const res = await apiClient.get('/admin/abuse/summary')
      setSummary(res.data)
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load summary')
    }
  }

  const loadEvents = async () => {
    try {
      const res = await apiClient.get(`/admin/abuse/events?limit=${limit}&offset=${page * limit}`)
      setEvents(res.data.items ?? [])
      setTotal(res.data.total ?? 0)
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load events')
    }
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      await Promise.all([loadSummary(), loadEvents()])
      setLoading(false)
    }
    load()
  }, [page])

  const openAction = (row: AbuseEventRow, action: 'throttle' | 'suspend' | 'ban') => {
    if (!row.userId) return
    setActionModal({ userId: row.userId, email: row.user ?? undefined })
    setActionType(action)
    setActionReason('')
  }

  const confirmAction = async () => {
    if (!actionModal) return
    setSubmitting(true)
    try {
      await apiClient.post('/admin/abuse/action', {
        userId: actionModal.userId,
        action: actionType,
        reason: actionReason || undefined,
      })
      setActionModal(null)
      loadSummary()
      loadEvents()
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Action failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading && !summary) return <div className="admin-loading">Loading abuse center…</div>
  if (error && !summary) return <div className="admin-error">{error}</div>

  return (
    <>
      <h2 className="admin-page-title">Abuse Center</h2>
      {error && <div className="admin-error">{error}</div>}
      {summary && (
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <div className="admin-stat-label">Suspicious Users Today</div>
            <div className="admin-stat-value">{summary.suspiciousUsersToday}</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">Rate Limit Violations</div>
            <div className="admin-stat-value">{summary.rateLimitViolations}</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">Repeated Target Attempts</div>
            <div className="admin-stat-value">{summary.repeatedTargetAttempts}</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">High Velocity Requests</div>
            <div className="admin-stat-value">{summary.highVelocityRequests}</div>
          </div>
        </div>
      )}

      <div className="admin-card">
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Events</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>IP</th>
                <th>Requests/Min</th>
                <th>Domains Targeted</th>
                <th>Risk Score</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {events.map((row) => (
                <tr key={row.id}>
                  <td>{row.user ?? row.userId ?? '—'}</td>
                  <td>{row.ip ?? '—'}</td>
                  <td>{row.requestsPerMin}</td>
                  <td>{row.domainsTargeted}</td>
                  <td>{row.riskScore}</td>
                  <td>
                    {row.userId && (
                      <>
                        <button type="button" className="admin-table-link" onClick={() => openAction(row, 'throttle')}>Throttle</button>
                        {' '}
                        <button type="button" className="admin-table-link" onClick={() => openAction(row, 'suspend')}>Suspend</button>
                        {' '}
                        <button type="button" className="admin-table-link" onClick={() => openAction(row, 'ban')}>Ban</button>
                      </>
                    )}
                  </td>
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

      {actionModal && (
        <div className="admin-modal-backdrop" onClick={() => !submitting && setActionModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">{actionType.charAt(0).toUpperCase() + actionType.slice(1)}</h3>
            </div>
            <div className="admin-modal-body">
              <p style={{ margin: '0 0 0.75rem 0' }}>User: {actionModal.email ?? actionModal.userId}</p>
              <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'oklch(0.7 0 0)' }}>Reason (optional)</span>
                <input
                  type="text"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  style={{ display: 'block', marginTop: 4, padding: '0.4rem 0.5rem', width: '100%', borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.3 0 0)', color: 'inherit' }}
                />
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={confirmAction} disabled={submitting} className="admin-table-link">
                  {submitting ? 'Applying…' : 'Confirm'}
                </button>
                <button type="button" onClick={() => setActionModal(null)} disabled={submitting}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
