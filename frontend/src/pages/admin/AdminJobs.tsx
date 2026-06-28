import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import { formatDateTime } from '../../utils/date'
import './Admin.css'

interface JobRow {
  job_id: string
  userId: string
  conversationId: string
  status: string
  createdAt: number
  userMessage: string
}

export default function AdminJobs() {
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await apiClient.get('/admin/jobs/active')
        setJobs(Array.isArray(res.data) ? res.data : [])
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load jobs')
      } finally {
        setLoading(false)
      }
    }
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [])

  if (loading && jobs.length === 0) return <div className="admin-loading">Loading jobs…</div>
  if (error) return <div className="admin-error">{error}</div>

  return (
    <>
      <h2 className="admin-page-title">Pentests & jobs</h2>
      <p style={{ color: '#a5a5a5', marginBottom: '1rem' }}>In-memory jobs (refreshes every 10s). Running count: {jobs.filter((j) => j.status === 'running').length}</p>
      <div className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>User ID</th>
                <th>Conversation</th>
                <th>Status</th>
                <th>Started</th>
                <th>Request</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.job_id}>
                  <td><code style={{ fontSize: '0.8rem' }}>{j.job_id.slice(0, 8)}…</code></td>
                  <td><code style={{ fontSize: '0.8rem' }}>{j.userId.slice(0, 8)}…</code></td>
                  <td><code style={{ fontSize: '0.8rem' }}>{j.conversationId?.slice(0, 8) || '—'}…</code></td>
                  <td>{j.status}</td>
                  <td>{formatDateTime(typeof j.createdAt === 'number' ? new Date(j.createdAt) : j.createdAt)}</td>
                  <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.userMessage || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {jobs.length === 0 && <p style={{ margin: 0, color: '#999999' }}>No active or recent jobs.</p>}
      </div>
    </>
  )
}
