import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import { formatDateTime } from '../../utils/date'
import './Admin.css'

interface ConvItem {
  id: string
  userId: string
  title: string | null
  createdAt: string
  messageCount: number
  user?: { id: string; email: string }
}

interface MessagePart {
  type: string
  content: string
  order: number
}

interface MessageDetail {
  id: string
  role: string
  content: string | null
  createdAt: string
  parts?: MessagePart[]
}

interface ConversationDetail {
  id: string
  userId: string
  title: string | null
  modelId: string | null
  runStatus: string
  pentestJobId: string | null
  createdAt: string
  updatedAt: string
  user?: { id: string; email: string }
  messages: MessageDetail[]
}

export default function AdminConversations() {
  const [data, setData] = useState<{ items: ConvItem[]; total: number }>({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const limit = 50

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await apiClient.get(`/admin/conversations?limit=${limit}&offset=${page * limit}`)
        setData(res.data)
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [page])

  useEffect(() => {
    if (!detailId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    apiClient
      .get(`/admin/conversations/${detailId}`)
      .then((res) => {
        if (!cancelled) setDetail(res.data)
      })
      .catch(() => {
        if (!cancelled) setDetail(null)
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailId])

  const getMessageText = (m: MessageDetail) => {
    if (m.content) return m.content
    const parts = (m.parts || []).sort((a, b) => a.order - b.order)
    return parts.map((p) => p.content).join('\n') || '—'
  }

  if (error) return <div className="admin-error">{error}</div>

  return (
    <>
      <h2 className="admin-page-title">Conversations</h2>
      {loading && <div className="admin-loading">Loading…</div>}
      {!loading && (
        <div className="admin-card">
          <p style={{ margin: '0 0 0.75rem 0', color: '#a5a5a5', fontSize: '0.9rem' }}>Total: {data.total}</p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>User</th>
                  <th>Messages</th>
                  <th>Created</th>
                  <th>ID</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id}>
                    <td>{(c.title || '—').slice(0, 40)}{(c.title && c.title.length > 40) ? '…' : ''}</td>
                    <td>{c.user?.email ?? c.userId?.slice(0, 8)}</td>
                    <td>{c.messageCount}</td>
                    <td>{formatDateTime(c.createdAt)}</td>
                    <td><code style={{ fontSize: '0.75rem' }}>{c.id.slice(0, 8)}…</code></td>
                    <td>
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        onClick={() => setDetailId(c.id)}
                      >
                        View detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.items.length === 0 && <p style={{ margin: 0, color: '#999999' }}>No conversations.</p>}
          {data.total > limit && (
            <div className="admin-page-controls">
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <span>Page {page + 1}</span>
              <button type="button" disabled={(page + 1) * limit >= data.total} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </div>
      )}

      {detailId && (
        <div className="admin-modal-backdrop" onClick={() => setDetailId(null)}>
          <div className="admin-modal admin-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                <h3 className="admin-modal-title">Conversation detail</h3>
                <button type="button" className="admin-notification-dismiss" onClick={() => setDetailId(null)} aria-label="Close">×</button>
              </div>
              {detail && (
                <p className="admin-modal-subtitle">
                  {detail.title || 'Untitled'} · {detail.user?.email ?? detail.userId} · {detail.runStatus} · {formatDateTime(detail.createdAt)}
                </p>
              )}
            </div>
            <div className="admin-modal-body admin-detail-body">
              {detailLoading && <div className="admin-loading">Loading…</div>}
              {!detailLoading && detail && (
                <>
                  <dl className="admin-detail-dl">
                    <dt>ID</dt>
                    <dd><code>{detail.id}</code></dd>
                    <dt>User</dt>
                    <dd>{detail.user?.email ?? detail.userId}</dd>
                    <dt>Run status</dt>
                    <dd>{detail.runStatus}</dd>
                    {detail.pentestJobId && (
                      <>
                        <dt>Pentest job</dt>
                        <dd><code style={{ fontSize: '0.8rem' }}>{detail.pentestJobId}</code></dd>
                      </>
                    )}
                  </dl>
                  <h4 className="admin-detail-section-title">Messages ({detail.messages.length})</h4>
                  <div className="admin-detail-messages">
                    {detail.messages.length === 0 && <p style={{ color: '#999999' }}>No messages.</p>}
                    {detail.messages.map((m) => (
                      <div key={m.id} className={`admin-detail-msg admin-detail-msg-${m.role}`}>
                        <div className="admin-detail-msg-meta">
                          <span className="admin-detail-msg-role">{m.role}</span>
                          <span className="admin-detail-msg-date">{formatDateTime(m.createdAt)}</span>
                        </div>
                        <pre className="admin-detail-msg-content">{getMessageText(m)}</pre>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
