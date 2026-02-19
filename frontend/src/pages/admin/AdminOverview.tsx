import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import apiClient from '../../utils/api'
import './Admin.css'

interface DashboardSummary {
  users: number
  admins: number
  aiAgents: number
  payments: number
  reports: number
  conversations: number
  hacktivityTotal: number
  activeJobsCount: number
  activeJobs: Array<{ job_id: string; userId: string; status: string; createdAt: number; userMessage: string }>
  recentActivity: Array<{
    id: string
    userId: string
    modelId: string
    inputTokens: number
    outputTokens: number
    createdAt: string
    user?: { id: string; email: string }
  }>
}

interface ChartDataset {
  label: string
  data: number[]
}

interface ChartData {
  labels: string[]
  datasets: ChartDataset[]
}

export default function AdminOverview() {
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const [dashboardRes, chartRes] = await Promise.all([
          apiClient.get('/admin/dashboard'),
          apiClient.get('/admin/dashboard/chart?days=14').catch(() => ({ data: null })),
        ])
        setData(dashboardRes.data)
        if (chartRes.data?.labels?.length) setChartData(chartRes.data)
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div className="admin-loading">Loading dashboard…</div>
  if (error) return <div className="admin-error">{error}</div>
  if (!data) return null

  const barData = chartData
    ? chartData.labels.map((label, i) => {
        const point: Record<string, string | number> = {
          name: label.slice(5),
          fullDate: label,
        }
        chartData.datasets.forEach((ds) => {
          point[ds.label] = ds.data[i] ?? 0
        })
        return point
      })
    : []

  const barColors = ['oklch(0.65 0.2 250)', 'oklch(0.7 0.18 160)', 'oklch(0.65 0.2 330)']

  return (
    <>
      <h2 className="admin-page-title">Overview</h2>
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-label">Users</div>
          <div className="admin-stat-value">{data.users}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Admins</div>
          <div className="admin-stat-value">{data.admins}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Conversations</div>
          <div className="admin-stat-value">{data.conversations}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Reports</div>
          <div className="admin-stat-value">{data.reports}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Hacktivity</div>
          <div className="admin-stat-value">{data.hacktivityTotal}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Active jobs</div>
          <div className="admin-stat-value">{data.activeJobsCount}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">AI Agents</div>
          <div className="admin-stat-value">{data.aiAgents}</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-label">Payments</div>
          <div className="admin-stat-value">{data.payments}</div>
        </div>
      </div>

      {barData.length > 0 && (
        <div className="admin-card admin-chart-card">
          <h3 className="admin-chart-title">Activity over the last 14 days</h3>
          <div className="admin-chart-wrap">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={barData}
                margin={{ top: 12, right: 12, bottom: 24, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0 0 / 0.5)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'oklch(0.7 0 0)', fontSize: 11 }}
                  axisLine={{ stroke: 'oklch(0.3 0 0)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'oklch(0.7 0 0)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'oklch(0.14 0 0)',
                    border: '1px solid oklch(0.28 0 0)',
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: 'oklch(0.9 0 0)' }}
                  labelFormatter={(label, payload) => {
                    const p = payload?.[0] as { payload?: { fullDate?: string } } | undefined
                    return p?.payload?.fullDate ?? label
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: 8 }}
                  formatter={(value) => <span style={{ color: 'oklch(0.8 0 0)' }}>{value}</span>}
                />
                {chartData?.datasets.map((ds, idx) => (
                  <Bar
                    key={ds.label}
                    dataKey={ds.label}
                    fill={barColors[idx % barColors.length]}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {data.activeJobs && data.activeJobs.length > 0 && (
        <div className="admin-card">
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Active / recent jobs</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>User</th>
                  <th>Status</th>
                  <th>Request</th>
                </tr>
              </thead>
              <tbody>
                {data.activeJobs.slice(0, 20).map((j) => (
                  <tr key={j.job_id}>
                    <td><code style={{ fontSize: '0.8rem' }}>{j.job_id.slice(0, 8)}…</code></td>
                    <td><code style={{ fontSize: '0.8rem' }}>{j.userId.slice(0, 8)}…</code></td>
                    <td>{j.status}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.userMessage || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.recentActivity && data.recentActivity.length > 0 && (
        <div className="admin-card">
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Recent activity</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Model</th>
                  <th>Tokens (in/out)</th>
                </tr>
              </thead>
              <tbody>
                {data.recentActivity.slice(0, 15).map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.createdAt).toLocaleString()}</td>
                    <td>{a.user?.email ?? a.userId?.slice(0, 8)}</td>
                    <td><code style={{ fontSize: '0.8rem' }}>{a.modelId?.slice(0, 8)}…</code></td>
                    <td>{a.inputTokens} / {a.outputTokens}</td>
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
