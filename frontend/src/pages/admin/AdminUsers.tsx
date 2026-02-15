import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

interface UserRow {
  id: string
  email: string | null
  name: string | null
  role: string
  createdAt: string
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [role, setRole] = useState('')
  const [search, setSearch] = useState('')

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

  return (
    <>
      <h2 className="admin-page-title">Users</h2>
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
      {error && <div className="admin-error">{error}</div>}
      {!loading && !error && (
        <div className="admin-card">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email ?? '—'}</td>
                    <td>{u.name ?? '—'}</td>
                    <td>{u.role}</td>
                    <td>{new Date(u.createdAt).toLocaleString()}</td>
                    <td><code style={{ fontSize: '0.75rem' }}>{u.id.slice(0, 8)}…</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users.length === 0 && <p style={{ margin: 0, color: 'oklch(0.6 0 0)' }}>No users found.</p>}
        </div>
      )}
    </>
  )
}
