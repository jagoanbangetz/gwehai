import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

interface Policies {
  blockLocalhost: boolean
  blockRfc1918Ip: boolean
  blockMetadataEndpoints: boolean
  blockRepeatedTargetScanning: boolean
  enforcePerPlanToolRestrictions: boolean
  strictExploitModeProOnly: boolean
  maxParallelJobsPerPlan: number
  maxSubAgentsPerPlan: number
  maxToolCallsPerJob: number
  maxStepsPerConversation: number
}

interface PlanLimits {
  workers: number
  sessions_per_day: number
  steps_per_session: number
  max_sub_agents: number
  tokens_per_step_total: number
  max_output_tokens: number
  tokens_per_day: number
  cooldown_between_steps_seconds: number
}

interface PlanDefinition {
  planId: string
  marketing_title: string
  monthlyPriceUsd: number
  limits: PlanLimits
}

export default function AdminGuardrails() {
  const [policies, setPolicies] = useState<Policies | null>(null)
  const [planDefinitions, setPlanDefinitions] = useState<PlanDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [policiesRes, plansRes] = await Promise.all([
          apiClient.get('/admin/policies'),
          apiClient.get('/admin/plans/definitions'),
        ])
        setPolicies(policiesRes.data)
        setPlanDefinitions(Array.isArray(plansRes.data) ? plansRes.data : [])
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSave = async () => {
    if (!policies) return
    setSaving(true)
    setSaved(false)
    try {
      await apiClient.post('/admin/policies/update', policies)
      setSaved(true)
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const update = <K extends keyof Policies>(key: K, value: Policies[K]) => {
    setPolicies((p) => (p ? { ...p, [key]: value } : null))
  }

  const formatLimit = (v: number): string => (v === -1 ? 'Unlimited*' : String(v))

  if (loading) return <div className="admin-loading">Loading guardrails…</div>
  if (error && !policies) return <div className="admin-error">{error}</div>
  if (!policies) return null

  return (
    <>
      <h2 className="admin-page-title">Guardrails</h2>
      {error && <div className="admin-error">{error}</div>}

      <div className="admin-card">
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Safety toggles</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[
            { key: 'blockLocalhost' as const, label: 'Block localhost' },
            { key: 'blockRfc1918Ip' as const, label: 'Block RFC1918 IP' },
            { key: 'blockMetadataEndpoints' as const, label: 'Block metadata endpoints' },
            { key: 'blockRepeatedTargetScanning' as const, label: 'Block repeated target scanning' },
            { key: 'enforcePerPlanToolRestrictions' as const, label: 'Enforce per-plan tool restrictions' },
            { key: 'strictExploitModeProOnly' as const, label: 'Enable strict exploit mode (PRO+ only)' },
          ].map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={policies[key]}
                onChange={(e) => update(key, e.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Global limits (policy overrides)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'oklch(0.65 0 0)' }}>Max parallel jobs per plan</span>
            <input
              type="number"
              min={1}
              value={policies.maxParallelJobsPerPlan}
              onChange={(e) => update('maxParallelJobsPerPlan', parseInt(e.target.value, 10) || 1)}
              style={{ padding: '0.4rem 0.5rem', borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.3 0 0)', color: 'inherit' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'oklch(0.65 0 0)' }}>Max sub-agents per plan</span>
            <input
              type="number"
              min={0}
              value={policies.maxSubAgentsPerPlan}
              onChange={(e) => update('maxSubAgentsPerPlan', parseInt(e.target.value, 10) || 0)}
              style={{ padding: '0.4rem 0.5rem', borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.3 0 0)', color: 'inherit' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'oklch(0.65 0 0)' }}>Max tool calls per job</span>
            <input
              type="number"
              min={1}
              value={policies.maxToolCallsPerJob}
              onChange={(e) => update('maxToolCallsPerJob', parseInt(e.target.value, 10) || 1)}
              style={{ padding: '0.4rem 0.5rem', borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.3 0 0)', color: 'inherit' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'oklch(0.65 0 0)' }}>Max steps per conversation</span>
            <input
              type="number"
              min={1}
              value={policies.maxStepsPerConversation}
              onChange={(e) => update('maxStepsPerConversation', parseInt(e.target.value, 10) || 1)}
              style={{ padding: '0.4rem 0.5rem', borderRadius: 6, background: 'oklch(0.12 0 0)', border: '1px solid oklch(0.3 0 0)', color: 'inherit' }}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '0.5rem 1rem', borderRadius: 6, background: 'oklch(0.25 0.06 260)', border: '1px solid oklch(0.35 0.08 260)', color: 'oklch(0.95 0 0)', cursor: saving ? 'wait' : 'pointer' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span style={{ marginLeft: '0.75rem', color: 'oklch(0.6 0.15 145)' }}>Saved.</span>}
      </div>

      <div className="admin-card">
        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>Plan limits (source of truth — same as plan menu)</h3>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'oklch(0.65 0 0)' }}>
          Limits are read from backend config. Adjust in <code>plans.config.ts</code> to change.
        </p>
        <div className="admin-guardrails-plans-grid">
          {planDefinitions.map((plan) => (
            <div key={plan.planId} className="admin-guardrails-plan-card">
              <div className="admin-guardrails-plan-header">
                <span className="admin-guardrails-plan-name">{plan.marketing_title}</span>
                <span className="admin-guardrails-plan-id">{plan.planId}</span>
                <span className="admin-guardrails-plan-price">
                  {plan.monthlyPriceUsd === 0 ? 'Free' : `$${plan.monthlyPriceUsd}/mo`}
                </span>
              </div>
              <dl className="admin-guardrails-plan-limits">
                <dt>Workers (concurrent targets)</dt>
                <dd>{formatLimit(plan.limits.workers)}</dd>
                <dt>Sessions per day</dt>
                <dd>{formatLimit(plan.limits.sessions_per_day)}</dd>
                <dt>Steps per session</dt>
                <dd>{formatLimit(plan.limits.steps_per_session)}</dd>
                <dt>Max sub-agents</dt>
                <dd>{formatLimit(plan.limits.max_sub_agents)}</dd>
                <dt>Tokens per day</dt>
                <dd>{plan.limits.tokens_per_day === -1 ? 'Unlimited*' : plan.limits.tokens_per_day.toLocaleString()}</dd>
                <dt>Tokens per step</dt>
                <dd>{plan.limits.tokens_per_step_total?.toLocaleString() ?? '—'}</dd>
                <dt>Max output tokens</dt>
                <dd>{plan.limits.max_output_tokens ?? '—'}</dd>
              </dl>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
