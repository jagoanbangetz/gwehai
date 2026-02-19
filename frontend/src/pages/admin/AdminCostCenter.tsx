import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

interface CostSummary {
  totalTokensToday: number
  totalTokensThisMonth: number
  totalAICalls: number
  estimatedCostUsd: string
  today: { tokens: number; costUsd: string }
  month: { tokens: number; costUsd: string }
}

interface CostUserRow {
  user: string
  userId: string
  plan: string
  model: string | null
  inputTokens: number
  outputTokens: number
  totalCost: string
  calls: number
  lastActive: string | null
}

export default function AdminCostCenter() {
  const [summary, setSummary] = useState<CostSummary | null>(null)
  const [users, setUsers] = useState<CostUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [model, setModel] = useState('')
  const [plan, setPlan] = useState('')
  const [page, setPage] = useState(0)
  const limit = 25

  const [settings, setSettings] = useState({
    globalDailyTokenCap: '',
    globalMonthlyTokenCap: '',
    perUserTokenCap: '',
    perPlanTokenCap: '',
    modelEscalationToggle: false,
  })
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  const loadSummary = async () => {
    try {
      const res = await apiClient.get('/admin/cost/summary')
      setSummary(res.data)
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load summary')
    }
  }

  const loadSettings = async () => {
    try {
      const res = await apiClient.get('/admin/cost/settings')
      const d = res.data
      setSettings({
        globalDailyTokenCap: d.globalDailyTokenCap != null ? String(d.globalDailyTokenCap) : '',
        globalMonthlyTokenCap: d.globalMonthlyTokenCap != null ? String(d.globalMonthlyTokenCap) : '',
        perUserTokenCap: d.perUserTokenCap != null ? String(d.perUserTokenCap) : '',
        perPlanTokenCap: d.perPlanTokenCap ?? '',
        modelEscalationToggle: !!d.modelEscalationToggle,
      })
    } catch {
      // ignore
    }
  }

  const loadUsers = async () => {
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (model) params.set('model', model)
      if (plan) params.set('plan', plan)
      params.set('limit', String(limit))
      params.set('offset', String(page * limit))
      const res = await apiClient.get(`/admin/cost/users?${params.toString()}`)
      setUsers(res.data.items ?? [])
      setTotal(res.data.total ?? 0)
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load users')
    }
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      await Promise.all([loadSummary(), loadUsers(), loadSettings()])
      setLoading(false)
    }
    load()
  }, [page, dateFrom, dateTo, model, plan])

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    setSettingsSaved(false)
    try {
      await apiClient.post('/admin/cost/settings', {
        globalDailyTokenCap: settings.globalDailyTokenCap ? parseInt(settings.globalDailyTokenCap, 10) : undefined,
        globalMonthlyTokenCap: settings.globalMonthlyTokenCap ? parseInt(settings.globalMonthlyTokenCap, 10) : undefined,
        perUserTokenCap: settings.perUserTokenCap ? parseInt(settings.perUserTokenCap, 10) : undefined,
        perPlanTokenCap: settings.perPlanTokenCap || undefined,
        modelEscalationToggle: settings.modelEscalationToggle,
      })
      setSettingsSaved(true)
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  if (loading && !summary) return <div className="admin-loading">Loading cost center…</div>
  if (error && !summary) return <div className="admin-error">{error}</div>

  return (
    <>
      <h2 className="admin-page-title">Cost Center</h2>
      {error && <div className="admin-error">{error}</div>}
      {summary && (
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <div className="admin-stat-label">Total Tokens Today</div>
            <div className="admin-stat-value">{summary.totalTokensToday.toLocaleString()}</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">Total Tokens This Month</div>
            <div className="admin-stat-value">{summary.totalTokensThisMonth.toLocaleString()}</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">Total AI Calls</div>
            <div className="admin-stat-value">{summary.totalAICalls.toLocaleString()}</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-label">Estimated Cost (USD)</div>
            <div className="admin-stat-value">${summary.estimatedCostUsd}</div>
          </div>
        </div>
      )}

      <div className="admin-card">
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Filters</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'oklch(0.7 0 0)' }}>Date from</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ padding: '0.35rem 0.5rem', borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.3 0 0)', color: 'inherit' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'oklch(0.7 0 0)' }}>Date to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ padding: '0.35rem 0.5rem', borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.3 0 0)', color: 'inherit' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'oklch(0.7 0 0)' }}>Model</span>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Model ID"
              style={{ padding: '0.35rem 0.5rem', width: 140, borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.3 0 0)', color: 'inherit' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'oklch(0.7 0 0)' }}>Plan</span>
            <input
              type="text"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="FREE / PRO"
              style={{ padding: '0.35rem 0.5rem', width: 100, borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.3 0 0)', color: 'inherit' }}
            />
          </label>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Plan</th>
                <th>Model</th>
                <th>Input Tokens</th>
                <th>Output Tokens</th>
                <th>Total Cost</th>
                <th>Calls</th>
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr key={row.userId}>
                  <td>{row.user || row.userId}</td>
                  <td>{row.plan}</td>
                  <td>{row.model ?? '—'}</td>
                  <td>{row.inputTokens.toLocaleString()}</td>
                  <td>{row.outputTokens.toLocaleString()}</td>
                  <td>${row.totalCost}</td>
                  <td>{row.calls}</td>
                  <td>{row.lastActive ? new Date(row.lastActive).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total > limit && (
          <div className="admin-page-controls">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span>Page {page + 1} · Total {total}</span>
            <button type="button" disabled={(page + 1) * limit >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </div>

      <div className="admin-card">
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Cost settings</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'oklch(0.65 0 0)' }}>Global Daily Token Cap</span>
            <input
              type="number"
              value={settings.globalDailyTokenCap}
              onChange={(e) => setSettings((s) => ({ ...s, globalDailyTokenCap: e.target.value }))}
              placeholder="e.g. 1000000"
              style={{ padding: '0.4rem 0.5rem', borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.3 0 0)', color: 'inherit' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'oklch(0.65 0 0)' }}>Global Monthly Token Cap</span>
            <input
              type="number"
              value={settings.globalMonthlyTokenCap}
              onChange={(e) => setSettings((s) => ({ ...s, globalMonthlyTokenCap: e.target.value }))}
              placeholder="e.g. 50000000"
              style={{ padding: '0.4rem 0.5rem', borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.3 0 0)', color: 'inherit' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'oklch(0.65 0 0)' }}>Per User Token Cap</span>
            <input
              type="number"
              value={settings.perUserTokenCap}
              onChange={(e) => setSettings((s) => ({ ...s, perUserTokenCap: e.target.value }))}
              placeholder="e.g. 100000"
              style={{ padding: '0.4rem 0.5rem', borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.3 0 0)', color: 'inherit' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'oklch(0.65 0 0)' }}>Per Plan Token Cap (JSON)</span>
            <input
              type="text"
              value={settings.perPlanTokenCap}
              onChange={(e) => setSettings((s) => ({ ...s, perPlanTokenCap: e.target.value }))}
              placeholder='{"FREE":100000}'
              style={{ padding: '0.4rem 0.5rem', borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.3 0 0)', color: 'inherit' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <input
              type="checkbox"
              checked={settings.modelEscalationToggle}
              onChange={(e) => setSettings((s) => ({ ...s, modelEscalationToggle: e.target.checked }))}
            />
            <span style={{ fontSize: '0.9rem' }}>Model Escalation Toggle</span>
          </label>
        </div>
        <button
          type="button"
          onClick={handleSaveSettings}
          disabled={savingSettings}
          style={{ padding: '0.5rem 1rem', borderRadius: 6, background: 'oklch(0.25 0.06 260)', border: '1px solid oklch(0.35 0.08 260)', color: 'oklch(0.95 0 0)', cursor: savingSettings ? 'wait' : 'pointer' }}
        >
          {savingSettings ? 'Saving…' : 'Save Settings'}
        </button>
        {settingsSaved && <span style={{ marginLeft: '0.75rem', color: 'oklch(0.6 0.15 145)' }}>Saved.</span>}
      </div>
    </>
  )
}
