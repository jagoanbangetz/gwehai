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
  user?: { id: string; email: string }
}

interface ReportDetail {
  id: string
  userId: string
  user?: { id: string; email: string }
  conversationId: string | null
  target: string | null
  status: string
  detail: string | null
  poc: string | null
  jobId: string | null
  fileUrl: string | null
  metadata: Record<string, unknown> | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export default function AdminReports() {
  const [data, setData] = useState<{ items: ReportRow[]; total: number }>({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ReportDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
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

  useEffect(() => {
    if (!detailId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    apiClient
      .get(`/admin/reports/${detailId}`)
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
                  <th>User</th>
                  <th>Conversation</th>
                  <th>Target</th>
                  <th>Status</th>
                  <th>ID</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td>{r.user?.email ?? r.userId?.slice(0, 8)}</td>
                    <td><code style={{ fontSize: '0.8rem' }}>{r.conversationId?.slice(0, 8) ?? '—'}…</code></td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.target ?? '—'}</td>
                    <td>{r.status}</td>
                    <td><code style={{ fontSize: '0.75rem' }}>{r.id.slice(0, 8)}…</code></td>
                    <td>
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary"
                        onClick={() => setDetailId(r.id)}
                      >
                        View detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.items.length === 0 && <p style={{ margin: 0, color: 'oklch(0.6 0 0)' }}>No reports.</p>}
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
                <h3 className="admin-modal-title">Report detail</h3>
                <button type="button" className="admin-notification-dismiss" onClick={() => setDetailId(null)} aria-label="Close">×</button>
              </div>
              {detail && (
                <p className="admin-modal-subtitle">
                  {detail.target ?? 'No target'} · {detail.status} · {new Date(detail.createdAt).toLocaleString()}
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
                    <dt>Conversation</dt>
                    <dd>{detail.conversationId ? <code style={{ fontSize: '0.8rem' }}>{detail.conversationId}</code> : '—'}</dd>
                    <dt>Target</dt>
                    <dd>{detail.target ?? '—'}</dd>
                    <dt>Status</dt>
                    <dd>{detail.status}</dd>
                    {detail.startedAt && (
                      <>
                        <dt>Started</dt>
                        <dd>{new Date(detail.startedAt).toLocaleString()}</dd>
                      </>
                    )}
                    {detail.finishedAt && (
                      <>
                        <dt>Finished</dt>
                        <dd>{new Date(detail.finishedAt).toLocaleString()}</dd>
                      </>
                    )}
                    {detail.fileUrl && (
                      <>
                        <dt>File</dt>
                        <dd><a href={detail.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'oklch(0.7 0.15 250)' }}>Open file</a></dd>
                      </>
                    )}
                  </dl>
                  {detail.detail && (
                    <>
                      <h4 className="admin-detail-section-title">Detail</h4>
                      <pre className="admin-detail-block">{detail.detail}</pre>
                    </>
                  )}
                  {detail.poc && (
                    <>
                      <h4 className="admin-detail-section-title">Proof of concept</h4>
                      <pre className="admin-detail-block">{detail.poc}</pre>
                    </>
                  )}
                  {detail.metadata && Object.keys(detail.metadata).length > 0 && (
                    <>
                      <h4 className="admin-detail-section-title">Metadata</h4>
                      <pre className="admin-detail-block">{JSON.stringify(detail.metadata, null, 2)}</pre>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
