import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

export default function AdminUsage() {
  const [summary, setSummary] = useState<{ byUser: Array<{ userId: string; inputTokens: string; outputTokens: string; calls: string }>; total: { inputTokens: string; outputTokens: string; calls: string } } | null>(null)
  const [behaviour, setBehaviour] = useState<Array<{ modelId: string; inputTokens: string; outputTokens: string; calls: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const [sumRes, behRes] = await Promise.all([
          apiClient.get('/admin/usage-summary'),
          apiClient.get('/admin/ai-behaviour'),
        ])
        setSummary(sumRes.data)
        setBehaviour(Array.isArray(behRes.data) ? behRes.data : [])
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div className="admin-loading">Loading usage…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <>
      <h2 className="admin-page-title">Usage & plans</h2>
      {summary?.total && (
        <div className="admin-card">
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Total usage</h3>
          <p style={{ margin: 0, color: 'oklch(0.85 0 0)' }}>
            Calls: {summary.total.calls} · Input tokens: {summary.total.inputTokens} · Output tokens: {summary.total.outputTokens}
          </p>
        </div>
      )}
      {summary?.byUser && summary.byUser.length > 0 && (
        <div className="admin-card">
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>By user (top 100)</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Calls</th>
                  <th>Input tokens</th>
                  <th>Output tokens</th>
                </tr>
              </thead>
              <tbody>
                {summary.byUser.slice(0, 50).map((u) => (
                  <tr key={u.userId}>
                    <td><code style={{ fontSize: '0.8rem' }}>{u.userId?.slice(0, 8)}…</code></td>
                    <td>{u.calls}</td>
                    <td>{u.inputTokens}</td>
                    <td>{u.outputTokens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {behaviour.length > 0 && (
        <div className="admin-card">
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>AI behaviour (by model)</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Model ID</th>
                  <th>Calls</th>
                  <th>Input tokens</th>
                  <th>Output tokens</th>
                </tr>
              </thead>
              <tbody>
                {behaviour.map((b) => (
                  <tr key={b.modelId}>
                    <td><code style={{ fontSize: '0.8rem' }}>{b.modelId?.slice(0, 12)}…</code></td>
                    <td>{b.calls}</td>
                    <td>{b.inputTokens}</td>
                    <td>{b.outputTokens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
