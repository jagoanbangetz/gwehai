import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

interface UsageSummary {
  total: { inputTokens: string; outputTokens: string; calls: string }
  byUser: Array<{
    userId: string
    userEmail: string | null
    inputTokens: string
    outputTokens: string
    calls: string
  }>
  byModel: Array<{
    modelId: string
    modelName: string | null
    modelDisplayName: string | null
    inputTokens: string
    outputTokens: string
    calls: string
  }>
}

export default function AdminUsage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await apiClient.get('/admin/usage-summary')
        setSummary(res.data)
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
  if (!summary) return null

  const total = summary.total || { inputTokens: '0', outputTokens: '0', calls: '0' }
  const byUser = summary.byUser || []
  const byModel = summary.byModel || []

  return (
    <>
      <h2 className="admin-page-title">Usage & plans</h2>
      <p style={{ margin: '0 0 1rem 0', fontSize: '0.88rem', color: 'oklch(0.65 0 0)' }}>
        Counts from recorded usage (chat and pentest). Data updates as users use the AI.
      </p>

      <div className="admin-card">
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Total usage</h3>
        <div className="admin-usage-totals">
          <span><strong>Calls:</strong> {total.calls ?? '0'}</span>
          <span><strong>Input tokens:</strong> {Number(total.inputTokens ?? 0).toLocaleString()}</span>
          <span><strong>Output tokens:</strong> {Number(total.outputTokens ?? 0).toLocaleString()}</span>
        </div>
      </div>

      <div className="admin-card">
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>By AI model</h3>
        <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.82rem', color: 'oklch(0.6 0 0)' }}>
          How many calls and tokens per model.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Model ID</th>
                <th>Calls</th>
                <th>Input tokens</th>
                <th>Output tokens</th>
              </tr>
            </thead>
            <tbody>
              {byModel.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: 'oklch(0.6 0 0)', padding: '1rem' }}>No usage recorded yet. Usage appears when users use chat or pentest.</td>
                </tr>
              ) : (
                byModel.map((b) => (
                  <tr key={b.modelId}>
                    <td>{b.modelDisplayName || b.modelName || '—'}</td>
                    <td><code style={{ fontSize: '0.8rem' }}>{b.modelId?.slice(0, 8)}…</code></td>
                    <td>{Number(b.calls).toLocaleString()}</td>
                    <td>{Number(b.inputTokens).toLocaleString()}</td>
                    <td>{Number(b.outputTokens).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-card">
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>By user (top 100)</h3>
        <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.82rem', color: 'oklch(0.6 0 0)' }}>
          Per-user call and token counts.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Calls</th>
                <th>Input tokens</th>
                <th>Output tokens</th>
              </tr>
            </thead>
            <tbody>
              {byUser.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ color: 'oklch(0.6 0 0)', padding: '1rem' }}>No usage recorded yet.</td>
                </tr>
              ) : (
                byUser.slice(0, 50).map((u) => (
                  <tr key={u.userId}>
                    <td>{u.userEmail || <code style={{ fontSize: '0.8rem' }}>{u.userId?.slice(0, 8)}…</code>}</td>
                    <td>{Number(u.calls).toLocaleString()}</td>
                    <td>{Number(u.inputTokens).toLocaleString()}</td>
                    <td>{Number(u.outputTokens).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
