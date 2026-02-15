import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

interface ReportRow {
  id: string
  userId: string
  conversationId: string | null
  target: string | null
  status: string
  createdAt: string
}

export default function AdminReports() {
  const [data, setData] = useState<{ items: ReportRow[]; total: number }>({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const limit = 50

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await apiClient.get(`/admin/reports?limit=${limit}&offset=${page * limit}`)
        setData(res.data)
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [page])

  if (error) return <div className="admin-error">{error}</div>

  return (
    <>
      <h2 className="admin-page-title">Reports</h2>
      {loading && <div className="admin-loading">Loading…</div>}
      {!loading && (
        <div className="admin-card">
          <p style={{ margin: '0 0 0.75rem 0', color: 'oklch(0.65 0 0)', fontSize: '0.9rem' }}>Total: {data.total}</p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>User ID</th>
                  <th>Conversation</th>
                  <th>Target</th>
                  <th>Status</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td><code style={{ fontSize: '0.8rem' }}>{r.userId?.slice(0, 8)}…</code></td>
                    <td><code style={{ fontSize: '0.8rem' }}>{r.conversationId?.slice(0, 8) ?? '—'}…</code></td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.target ?? '—'}</td>
                    <td>{r.status}</td>
                    <td><code style={{ fontSize: '0.75rem' }}>{r.id.slice(0, 8)}…</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.items.length === 0 && <p style={{ margin: 0, color: 'oklch(0.6 0 0)' }}>No reports.</p>}
          {data.total > limit && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <span>Page {page + 1}</span>
              <button type="button" disabled={(page + 1) * limit >= data.total} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
