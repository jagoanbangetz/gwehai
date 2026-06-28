import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import { formatDateTime } from '../../utils/date'
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

const today = new Date().toISOString().slice(0, 10)

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
      <p style={{ margin: '0 0 1rem 0', fontSize: '0.88rem', color: '#a5a5a5' }}>
        Usage is recorded when users use chat or pentest. Totals below are from usage; the table lists all users and their usage in the selected date range. Cost settings are saved for future enforcement.
      </p>
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
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Usage by user</h3>
        <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.82rem', color: '#999999' }}>
          Filter by date range (click the field to open the date picker), model, or plan. Leave dates empty for all-time.
        </p>
        <div className="admin-cost-filters">
          <label className="admin-cost-filter-group">
            <span className="admin-cost-filter-label">Date from</span>
            <input
              type="date"
              className="admin-date-input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              max={dateTo || today}
              aria-label="From date"
            />
          </label>
          <label className="admin-cost-filter-group">
            <span className="admin-cost-filter-label">Date to</span>
            <input
              type="date"
              className="admin-date-input"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              max={today}
              aria-label="To date"
            />
          </label>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            style={{ alignSelf: 'flex-end' }}
          >
            Clear dates
          </button>
          <label className="admin-cost-filter-group">
            <span className="admin-cost-filter-label">Model ID</span>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Optional"
              className="admin-cost-text-input"
            />
          </label>
          <label className="admin-cost-filter-group">
            <span className="admin-cost-filter-label">Plan</span>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="admin-cost-text-input"
              style={{ width: 120 }}
            >
              <option value="">All</option>
              <option value="FREE">FREE</option>
              <option value="PRO">PRO</option>
              <option value="PRO_PLUS">PRO_PLUS</option>
              <option value="ULTRA">ULTRA</option>
            </select>
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
                  <td>{row.lastActive ? formatDateTime(row.lastActive) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && !loading && <p className="admin-cost-empty">No users in the system yet.</p>}
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
            <span style={{ fontSize: '0.8rem', color: '#a5a5a5' }}>Global Daily Token Cap</span>
            <input
              type="number"
              value={settings.globalDailyTokenCap}
              onChange={(e) => setSettings((s) => ({ ...s, globalDailyTokenCap: e.target.value }))}
              placeholder="e.g. 1000000"
              style={{ padding: '0.4rem 0.5rem', borderRadius: 6, background: '#1e1e1e', border: '1px solid #4c4c4c', color: 'inherit' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#a5a5a5' }}>Global Monthly Token Cap</span>
            <input
              type="number"
              value={settings.globalMonthlyTokenCap}
              onChange={(e) => setSettings((s) => ({ ...s, globalMonthlyTokenCap: e.target.value }))}
              placeholder="e.g. 50000000"
              style={{ padding: '0.4rem 0.5rem', borderRadius: 6, background: '#1e1e1e', border: '1px solid #4c4c4c', color: 'inherit' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#a5a5a5' }}>Per User Token Cap</span>
            <input
              type="number"
              value={settings.perUserTokenCap}
              onChange={(e) => setSettings((s) => ({ ...s, perUserTokenCap: e.target.value }))}
              placeholder="e.g. 100000"
              style={{ padding: '0.4rem 0.5rem', borderRadius: 6, background: '#1e1e1e', border: '1px solid #4c4c4c', color: 'inherit' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#a5a5a5' }}>Per Plan Token Cap (JSON)</span>
            <input
              type="text"
              value={settings.perPlanTokenCap}
              onChange={(e) => setSettings((s) => ({ ...s, perPlanTokenCap: e.target.value }))}
              placeholder='{"FREE":100000}'
              style={{ padding: '0.4rem 0.5rem', borderRadius: 6, background: '#1e1e1e', border: '1px solid #4c4c4c', color: 'inherit' }}
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
          style={{ padding: '0.5rem 1rem', borderRadius: 6, background: '#3f3f3f', border: '1px solid #595959', color: '#f2f2f2', cursor: savingSettings ? 'wait' : 'pointer' }}
        >
          {savingSettings ? 'Saving…' : 'Save Settings'}
        </button>
        {settingsSaved && <span style={{ marginLeft: '0.75rem', color: '#999999' }}>Saved.</span>}
      </div>
    </>
  )
}
