import { useEffect, useState, useMemo } from 'react'
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

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export default function AdminHacktivity() {
  const [data, setData] = useState<{ items: HacktivityRow[]; total: number }>({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<HacktivityRow | null>(null)
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

  // Realtime updates via SSE for admins: listen to /admin/hacktivity/stream
  useEffect(() => {
    const storedUser = localStorage.getItem('scout_user')
    if (!storedUser) return
    let token: string | null = null
    try {
      token = JSON.parse(storedUser).token
    } catch {
      token = null
    }
    if (!token) return

    const url = `${API_BASE}/admin/hacktivity/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)

    es.onmessage = (e) => {
      if (!e.data) return
      try {
        const raw = JSON.parse(e.data) as any
        const parsed: HacktivityRow = (raw && raw.data) ? raw.data : raw
        if (!parsed || !parsed.id) return
        // Only update current page; prepend into first page
        setData((prev) => {
          if (page !== 0) {
            return { ...prev, total: prev.total + 1 }
          }
          const items = [parsed, ...prev.items].slice(0, limit)
          return { items, total: prev.total + 1 }
        })
      } catch {
        // ignore malformed event
      }
    }

    es.onerror = () => {
      // Let browser handle reconnects; if it closes, we just stop receiving updates
    }

    return () => {
      es.close()
    }
  }, [page, limit])

  const actionLabel = (toolArgs: Record<string, unknown> | null): string => {
    if (!toolArgs || typeof toolArgs !== 'object') return '—'
    const name = (toolArgs.name ?? toolArgs.tool ?? toolArgs.command ?? toolArgs.path) as string | undefined
    if (typeof name === 'string') return name.slice(0, 24)
    const first = Object.keys(toolArgs)[0]
    return first ? first.slice(0, 24) : '—'
  }

  const selectedPretty = useMemo(() => {
    if (!selected) return null
    try {
      return JSON.stringify(
        {
          id: selected.id,
          createdAt: selected.createdAt,
          userId: selected.userId,
          userEmail: selected.user?.email ?? null,
          conversationId: selected.conversationId,
          domain: selected.domain,
          result: selected.result,
          toolArgs: selected.toolArgs,
        },
        null,
        2,
      )
    } catch {
      return null
    }
  }, [selected])

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
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((h) => (
                  <tr
                    key={h.id}
                    className={`admin-row-clickable${selected?.id === h.id ? ' admin-row-selected' : ''}`}
                    onClick={() => setSelected(h)}
                  >
                    <td>{new Date(h.createdAt).toLocaleString()}</td>
                    <td>{h.user?.email ?? h.userId?.slice(0, 8)}</td>
                    <td><code style={{ fontSize: '0.8rem' }}>{actionLabel(h.toolArgs)}</code></td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.domain ?? '—'}</td>
                    <td><code style={{ fontSize: '0.75rem' }}>{h.conversationId?.slice(0, 8) ?? '—'}…</code></td>
                    <td style={{ width: 70 }}>
                      <button
                        type="button"
                        className="admin-table-link"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelected(h)
                        }}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.items.length === 0 && <p style={{ margin: 0, color: 'oklch(0.6 0 0)' }}>No hacktivity.</p>}
          {data.total > limit && (
            <div className="admin-page-controls">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Prev
              </button>
              <span>Page {page + 1}</span>
              <button
                type="button"
                disabled={(page + 1) * limit >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
      {selected && selectedPretty && (
        <div
          className="admin-modal-backdrop"
          onClick={() => setSelected(null)}
        >
          <div
            className="admin-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <div>
                <div className="admin-modal-title">Hacktivity event</div>
                <div className="admin-modal-subtitle">
                  {selected.user?.email ?? selected.userId?.slice(0, 8)} ·{' '}
                  {new Date(selected.createdAt).toLocaleString()}
                </div>
              </div>
              <button
                type="button"
                className="admin-table-link"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <div className="admin-modal-body">
              <pre className="admin-detail-pre">{selectedPretty}</pre>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
