import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import { formatDateTime } from '../../utils/date'
import './Admin.css'

interface AuditRow {
  id: string
  adminUserId: string
  action: string
  resource: string | null
  details: string | null
  ipAddress: string | null
  createdAt: string
}

export default function AdminAudit() {
  const [data, setData] = useState<{ items: AuditRow[]; total: number }>({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [_error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const limit = 50
  const [exportType, setExportType] = useState('users')
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<string | null>(null)

  const loadAudit = async () => {
    try {
      setLoading(true)
      const res = await apiClient.get(`/admin/audit-log?limit=${limit}&offset=${page * limit}`)
      setData(res.data)
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAudit()
  }, [page])

  const handleExport = async () => {
    try {
      setExporting(true)
      setExportResult(null)
      const res = await apiClient.get(`/admin/export?type=${encodeURIComponent(exportType)}`)
      setExportResult(`Exported ${res.data.count} ${res.data.type}. (Check network tab for JSON.)`)
      if (res.data.items?.length > 0) {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `admin-export-${exportType}-${Date.now()}.json`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (e: any) {
      setExportResult(e?.response?.data?.message || e?.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <h2 className="admin-page-title">Audit</h2>
      <div className="admin-card">
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Export data</h3>
        <p style={{ margin: '0 0 0.5rem 0', color: 'oklch(0.7 0 0)', fontSize: '0.9rem' }}>Download up to 1000 rows as JSON. Action is logged.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <select
            value={exportType}
            onChange={(e) => setExportType(e.target.value)}
            style={{ padding: '0.4rem 0.6rem', borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.25 0 0)', color: 'inherit' }}
          >
            <option value="users">Users</option>
            <option value="conversations">Conversations</option>
            <option value="reports">Reports</option>
            <option value="hacktivity">Hacktivity</option>
          </select>
          <button type="button" onClick={handleExport} disabled={exporting} style={{ padding: '0.4rem 0.8rem', borderRadius: 6, background: 'oklch(0.3 0.05 250)', border: 'none', color: 'white', cursor: 'pointer' }}>
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
        {exportResult && <p style={{ margin: '0.5rem 0 0', color: 'oklch(0.85 0 0)', fontSize: '0.9rem' }}>{exportResult}</p>}
      </div>
      <div className="admin-card">
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Audit log</h3>
        <p style={{ margin: '0 0 0.5rem 0', color: 'oklch(0.65 0 0)', fontSize: '0.9rem' }}>Total: {data.total}</p>
        {loading && <div className="admin-loading">Loading…</div>}
        {!loading && (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Admin</th>
                    <th>Action</th>
                    <th>Resource</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((a) => (
                    <tr key={a.id}>
                      <td>{formatDateTime(a.createdAt)}</td>
                      <td><code style={{ fontSize: '0.8rem' }}>{a.adminUserId?.slice(0, 8)}…</code></td>
                      <td>{a.action}</td>
                      <td>{a.resource ?? '—'}</td>
                      <td>{a.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.items.length === 0 && <p style={{ margin: 0, color: 'oklch(0.6 0 0)' }}>No audit entries yet.</p>}
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
          </>
        )}
      </div>
    </>
  )
}
