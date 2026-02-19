import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

const PLAN_IDS = ['FREE', 'PRO', 'PRO_PLUS', 'ULTRA'] as const

interface UserRow {
  id: string
  email: string | null
  name: string | null
  role: string
  planId?: string | null
  createdAt: string
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [role, setRole] = useState('')
  const [search, setSearch] = useState('')
  const [planModal, setPlanModal] = useState<{ user: UserRow; planId: string } | null>(null)
  const [passwordModal, setPasswordModal] = useState<{ user: UserRow; newPassword: string } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [successNotification, setSuccessNotification] = useState<string | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (role) params.set('role', role)
      if (search.trim()) params.set('search', search.trim())
      params.set('limit', '200')
      const res = await apiClient.get(`/admin/users?${params.toString()}`)
      setUsers(Array.isArray(res.data) ? res.data : [])
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [role])

  const handleChangePlan = async () => {
    if (!planModal) return
    setActionLoading(true)
    setActionError(null)
    try {
      await apiClient.patch(`/admin/users/${planModal.user.id}/plan`, { planId: planModal.planId })
      setPlanModal(null)
      setSuccessNotification('Plan updated successfully.')
      setTimeout(() => setSuccessNotification(null), 5000)
      load()
    } catch (e: any) {
      setActionError(e?.response?.data?.message || e?.message || 'Failed to update plan')
    } finally {
      setActionLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!passwordModal || !passwordModal.newPassword || passwordModal.newPassword.length < 8) {
      setActionError('Password must be at least 8 characters')
      return
    }
    setActionLoading(true)
    setActionError(null)
    try {
      await apiClient.patch(`/admin/users/${passwordModal.user.id}/reset-password`, {
        newPassword: passwordModal.newPassword,
      })
      setPasswordModal(null)
      setSuccessNotification('Password reset successfully.')
      setTimeout(() => setSuccessNotification(null), 5000)
    } catch (e: any) {
      setActionError(e?.response?.data?.message || e?.message || 'Failed to reset password')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <>
      <h2 className="admin-page-title">Users</h2>
      {successNotification && (
        <div className="admin-notification admin-notification-success" role="alert">
          <span>{successNotification}</span>
          <button type="button" className="admin-notification-dismiss" onClick={() => setSuccessNotification(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      {error && (
        <div className="admin-notification admin-notification-error" role="alert">
          <span>{error}</span>
          <button type="button" className="admin-notification-dismiss" onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      <div className="admin-card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <label>
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ marginLeft: '0.5rem', padding: '0.4rem 0.6rem', borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.25 0 0)', color: 'inherit' }}
            >
              <option value="">All</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            Search
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Email or name"
              style={{ marginLeft: '0.5rem', padding: '0.4rem 0.6rem', width: 200, borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.25 0 0)', color: 'inherit' }}
            />
          </label>
          <button type="button" onClick={load} style={{ padding: '0.4rem 0.8rem', borderRadius: 6, background: 'oklch(0.3 0.05 250)', border: 'none', color: 'white', cursor: 'pointer' }}>
            Search
          </button>
        </div>
      </div>
      {loading && <div className="admin-loading">Loading…</div>}
      {!loading && (
        <div className="admin-card">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Plan</th>
                  <th>Created</th>
                  <th>ID</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email ?? '—'}</td>
                    <td>{u.name ?? '—'}</td>
                    <td>{u.role}</td>
                    <td>{u.planId ?? 'FREE'}</td>
                    <td>{new Date(u.createdAt).toLocaleString()}</td>
                    <td><code style={{ fontSize: '0.75rem' }}>{u.id.slice(0, 8)}…</code></td>
                    <td>
                      <div className="admin-user-actions">
                        <button
                          type="button"
                          className="admin-btn admin-btn-secondary"
                          onClick={() => { setActionError(null); setPlanModal({ user: u, planId: u.planId ?? 'FREE' }); }}
                        >
                          Change plan
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn-secondary"
                          onClick={() => { setActionError(null); setPasswordModal({ user: u, newPassword: '' }); }}
                        >
                          Reset password
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users.length === 0 && <p style={{ margin: 0, color: 'oklch(0.6 0 0)' }}>No users found.</p>}
        </div>
      )}

      {planModal && (
        <div className="admin-modal-backdrop" onClick={() => !actionLoading && setPlanModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <h3 className="admin-modal-title">Change plan</h3>
            <p className="admin-modal-subtitle">User: {planModal.user.email ?? planModal.user.id}</p>
            </div>
            <div className="admin-modal-body">
              <label className="admin-modal-label">
                Plan
                <select
                  value={planModal.planId}
                  onChange={(e) => setPlanModal((m) => m && { ...m, planId: e.target.value })}
                  className="admin-modal-select"
                >
                  {PLAN_IDS.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </label>
              {actionError && <p className="admin-modal-error">{actionError}</p>}
              <div className="admin-modal-actions">
                <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setPlanModal(null)} disabled={actionLoading}>
                  Cancel
                </button>
                <button type="button" className="admin-btn admin-btn-primary" onClick={handleChangePlan} disabled={actionLoading}>
                  {actionLoading ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {passwordModal && (
        <div className="admin-modal-backdrop" onClick={() => !actionLoading && setPasswordModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <h3 className="admin-modal-title">Reset password</h3>
              <p className="admin-modal-subtitle">User: {passwordModal.user.email ?? passwordModal.user.id}</p>
            </div>
            <div className="admin-modal-body">
              <label className="admin-modal-label">
                New password (min 8 characters)
                <input
                  type="password"
                  value={passwordModal.newPassword}
                  onChange={(e) => setPasswordModal((m) => m && { ...m, newPassword: e.target.value })}
                  className="admin-modal-input"
                  placeholder="New password"
                  autoComplete="new-password"
                />
              </label>
              {actionError && <p className="admin-modal-error">{actionError}</p>}
              <div className="admin-modal-actions">
                <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setPasswordModal(null)} disabled={actionLoading}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={handleResetPassword}
                  disabled={actionLoading || passwordModal.newPassword.length < 8}
                >
                  {actionLoading ? 'Saving…' : 'Reset password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
