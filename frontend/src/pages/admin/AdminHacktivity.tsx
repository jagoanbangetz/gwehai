import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

interface HacktivityRow {
  id: string
  userId: string
  conversationId: string | null
  domain: string | null
  result: string | null
  toolArgs: Record<string, unknown> | null
  createdAt: string
  user?: { id: string; email: string }
}

export default function AdminHacktivity() {
  const [data, setData] = useState<{ items: HacktivityRow[]; total: number }>({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const limit = 50

  const load = async () => {
    try {
      setLoading(true)
      const res = await apiClient.get(`/admin/hacktivity?limit=${limit}&offset=${page * limit}`)
      setData(res.data)
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [page])

  const actionLabel = (toolArgs: Record<string, unknown> | null): string => {
    if (!toolArgs || typeof toolArgs !== 'object') return '—'
    const name = (toolArgs.name ?? toolArgs.tool ?? toolArgs.command ?? toolArgs.path) as string | undefined
    if (typeof name === 'string') return name.slice(0, 24)
    const first = Object.keys(toolArgs)[0]
    return first ? first.slice(0, 24) : '—'
  }

  if (error) return <div className="admin-error">{error}</div>

  return (
    <>
      <h2 className="admin-page-title">Hacktivity</h2>
      {loading && <div className="admin-loading">Loading…</div>}
      {!loading && (
        <div className="admin-card">
          <p style={{ margin: '0 0 0.75rem 0', color: 'oklch(0.65 0 0)', fontSize: '0.9rem' }}>Total: {data.total}</p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Domain</th>
                  <th>Conversation</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((h) => (
                  <tr key={h.id}>
                    <td>{new Date(h.createdAt).toLocaleString()}</td>
                    <td>{h.user?.email ?? h.userId?.slice(0, 8)}</td>
                    <td><code style={{ fontSize: '0.8rem' }}>{actionLabel(h.toolArgs)}</code></td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.domain ?? '—'}</td>
                    <td><code style={{ fontSize: '0.75rem' }}>{h.conversationId?.slice(0, 8) ?? '—'}…</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.items.length === 0 && <p style={{ margin: 0, color: 'oklch(0.6 0 0)' }}>No hacktivity.</p>}
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
