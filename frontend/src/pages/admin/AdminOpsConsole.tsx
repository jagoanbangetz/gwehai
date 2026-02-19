import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import { formatDateTime } from '../../utils/date'
import './Admin.css'

interface JobRow {
  job_id: string
  userId: string
  conversationId: string
  target: string
  status: string
  phase: string
  started: number
  durationSeconds: number
  workerId: string
  userMessage?: string
}

interface WorkersStatus {
  activeWorkers: number
  maxWorkers: number
  queueSize: number
  stuckJobs: number
}

export default function AdminOpsConsole() {
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [workers, setWorkers] = useState<WorkersStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionModal, setActionModal] = useState<{ jobId: string; action: 'pause' | 'resume' | 'cancel' | 'retry' } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    setError(null)
    try {
      const jobsRes = await apiClient.get('/admin/jobs/live').catch((e: any) => {
        setError(e?.response?.data?.message || e?.message || 'Failed to load jobs')
        return { data: { items: [] } }
      })
      setJobs(jobsRes.data?.items ?? [])
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load')
    }
    try {
      const workersRes = await apiClient.get('/admin/workers/status')
      setWorkers(workersRes.data)
    } catch (e: any) {
      setWorkers(null)
      setError((prev) => prev || (e?.response?.data?.message || e?.message || 'Workers status failed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [])

  const openAction = (jobId: string, action: 'pause' | 'resume' | 'cancel' | 'retry') => {
    setActionModal({ jobId, action })
  }

  const confirmJobAction = async () => {
    if (!actionModal) return
    setSubmitting(true)
    try {
      await apiClient.post('/admin/jobs/action', { jobId: actionModal.jobId, action: actionModal.action })
      setActionModal(null)
      load()
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Action failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRestartWorkers = async () => {
    try {
      await apiClient.post('/admin/workers/restart')
      load()
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Restart failed')
    }
  }

  if (loading && jobs.length === 0) return <div className="admin-loading">Loading ops console…</div>
  if (error && jobs.length === 0 && !workers) return <div className="admin-error">{error}</div>

  return (
    <>
      <h2 className="admin-page-title">Ops Console</h2>
      {error && <div className="admin-error">{error}</div>}
      {workers && (
        <div className="admin-card">
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Worker panel</h3>
          <div className="admin-stats-grid" style={{ marginBottom: '1rem' }}>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Active Workers</div>
              <div className="admin-stat-value">{workers.activeWorkers}</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Max Workers</div>
              <div className="admin-stat-value">{workers.maxWorkers}</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Queue Size</div>
              <div className="admin-stat-value">{workers.queueSize}</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-label">Stuck Jobs</div>
              <div className="admin-stat-value">{workers.stuckJobs}</div>
            </div>
          </div>
          <button type="button" className="admin-table-link" onClick={handleRestartWorkers}>Restart Worker</button>
        </div>
      )}

      <div className="admin-card">
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Active jobs (auto-refresh 10s)</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>User</th>
                <th>Conversation</th>
                <th>Target</th>
                <th>Status</th>
                <th>Phase</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Worker ID</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.job_id}>
                  <td><code style={{ fontSize: '0.8rem' }}>{j.job_id.slice(0, 8)}…</code></td>
                  <td><code style={{ fontSize: '0.8rem' }}>{j.userId.slice(0, 8)}…</code></td>
                  <td><code style={{ fontSize: '0.8rem' }}>{j.conversationId?.slice(0, 8) || '—'}…</code></td>
                  <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }} title={j.target}>{j.target || '—'}</td>
                  <td>{j.status}</td>
                  <td>{j.phase}</td>
                  <td>{j.started ? formatDateTime(new Date(j.started)) : '—'}</td>
                  <td>{j.durationSeconds != null ? `${j.durationSeconds}s` : '—'}</td>
                  <td><code style={{ fontSize: '0.8rem' }}>{j.workerId?.slice(0, 8) || '—'}…</code></td>
                  <td>
                    <button type="button" className="admin-table-link" onClick={() => openAction(j.job_id, 'pause')}>Pause</button>
                    {' '}
                    <button type="button" className="admin-table-link" onClick={() => openAction(j.job_id, 'resume')}>Resume</button>
                    {' '}
                    <button type="button" className="admin-table-link" onClick={() => openAction(j.job_id, 'cancel')}>Cancel</button>
                    {' '}
                    <button type="button" className="admin-table-link" onClick={() => openAction(j.job_id, 'retry')}>Retry</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {jobs.length === 0 && <p style={{ margin: 0, color: 'oklch(0.6 0 0)' }}>No active jobs.</p>}
      </div>

      {actionModal && (
        <div className="admin-modal-backdrop" onClick={() => !submitting && setActionModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">{actionModal.action}</h3>
            </div>
            <div className="admin-modal-body">
              <p style={{ margin: '0 0 0.75rem 0' }}>Job: {actionModal.jobId}</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={confirmJobAction} disabled={submitting} className="admin-table-link">
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
