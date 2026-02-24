import { useEffect, useState } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

interface BillingSettings {
  paypalEnabled: boolean
  paypalClientId: string
  paypalClientSecretMasked: string
  paypalMode: string
  paypalPlanPro: string
  paypalPlanProPlus: string
  paypalPlanUltra: string
  priceMonthlyPRO: number
  priceMonthlyPRO_PLUS: number
  priceMonthlyULTRA: number
}

const defaultSettings: BillingSettings = {
  paypalEnabled: false,
  paypalClientId: '',
  paypalClientSecretMasked: '',
  paypalMode: 'sandbox',
  paypalPlanPro: '',
  paypalPlanProPlus: '',
  paypalPlanUltra: '',
  priceMonthlyPRO: 19,
  priceMonthlyPRO_PLUS: 49,
  priceMonthlyULTRA: 99,
}

interface BillingModel {
  id: string
  key: string
  provider: string
  enabled: boolean
  supportsPromptCache: boolean
  priceInPer1M: number
  priceOutPer1M: number
  priceCachedInPer1M: number | null
  toolCallFeeUsd: number | null
  minCostCredits: number | null
}

interface BillingPolicySnapshot {
  id: string
  creditUsd: number
  defaultRetryFactor: number
  defaultPlatformFeeUsd: number
  minCreditsPerOp: Record<string, number>
}

interface PlanBillingRuleSnapshot {
  planId: string
  planMarkup: number
  maxCreditsPerRun: number
  maxTokensPerRun: number
  maxStepsPerRun: number
  allowedModels: string[]
  opMultipliers: Record<string, number>
  modelMultiplierOverrides: Record<string, number> | null
  opRetryFactorOverrides: Record<string, number> | null
  opPlatformFeeOverrides: Record<string, number> | null
}

interface BillingConfigResponse {
  version: number
  creditUsd: number
  policy: BillingPolicySnapshot
  models: BillingModel[]
  planRules: Record<string, PlanBillingRuleSnapshot>
}

type MainTab = 'paypal' | 'credits'
type CreditsSubTab = 'models' | 'plan-rules' | 'policy'

export default function AdminBilling() {
  const [settings, setSettings] = useState<BillingSettings>(defaultSettings)
  const [newSecret, setNewSecret] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creatingPlans, setCreatingPlans] = useState(false)
  const [updatingPrices, setUpdatingPrices] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [mainTab, setMainTab] = useState<MainTab>('paypal')
  const [creditsSubTab, setCreditsSubTab] = useState<CreditsSubTab>('models')
  const [billingConfig, setBillingConfig] = useState<BillingConfigResponse | null>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await apiClient.get<BillingSettings>('/admin/billing-settings')
      setSettings(res.data)
      setNewSecret('')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to load billing settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const loadBillingConfig = async () => {
    try {
      setConfigLoading(true)
      setError(null)
      const res = await apiClient.get<BillingConfigResponse>('/admin/billing/config')
      setBillingConfig(res.data)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to load billing config')
    } finally {
      setConfigLoading(false)
    }
  }

  useEffect(() => {
    if (mainTab === 'credits') loadBillingConfig()
  }, [mainTab])

  const handleChange = (field: keyof BillingSettings, value: string | number | boolean) => {
    setSettings((s) => ({ ...s, [field]: value }))
    setMessage(null)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)
      setMessage(null)
      const body: Record<string, unknown> = {
        paypalEnabled: settings.paypalEnabled,
        paypalClientId: settings.paypalClientId,
        paypalMode: settings.paypalMode,
        paypalPlanPro: settings.paypalPlanPro,
        paypalPlanProPlus: settings.paypalPlanProPlus,
        paypalPlanUltra: settings.paypalPlanUltra,
        priceMonthlyPRO: settings.priceMonthlyPRO,
        priceMonthlyPRO_PLUS: settings.priceMonthlyPRO_PLUS,
        priceMonthlyULTRA: settings.priceMonthlyULTRA,
      }
      if (newSecret.trim()) body.paypalClientSecret = newSecret.trim()
      await apiClient.post('/admin/billing-settings/update', body)
      setMessage('Billing settings saved.')
      setNewSecret('')
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleCreatePaypalPlans = async () => {
    try {
      setCreatingPlans(true)
      setError(null)
      setMessage(null)
      await apiClient.post<{ planPro: string; planProPlus: string; planUltra: string }>(
        '/admin/billing-settings/create-paypal-plans',
      )
      setMessage('PayPal plans created and Plan IDs saved. You can save again to confirm.')
      await load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to create plans in PayPal')
    } finally {
      setCreatingPlans(false)
    }
  }

  const handleUpdatePaypalPrices = async () => {
    try {
      setUpdatingPrices(true)
      setError(null)
      setMessage(null)
      await apiClient.post('/admin/paypal/plans/update-all-prices', {
        priceMonthlyPRO: settings.priceMonthlyPRO,
        priceMonthlyPRO_PLUS: settings.priceMonthlyPRO_PLUS,
        priceMonthlyULTRA: settings.priceMonthlyULTRA,
      })
      setMessage('PayPal plan prices updated.')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to update prices in PayPal')
    } finally {
      setUpdatingPrices(false)
    }
  }

  const hasAllPlanIds =
    settings.paypalPlanPro?.trim() &&
    settings.paypalPlanProPlus?.trim() &&
    settings.paypalPlanUltra?.trim()

  const saveModels = async () => {
    if (!billingConfig) return
    try {
      setConfigSaving(true)
      setError(null)
      setMessage(null)
      await apiClient.put('/admin/billing/models', {
        models: billingConfig.models.map((m) => ({
          id: m.id,
          enabled: m.enabled,
          supportsPromptCache: m.supportsPromptCache,
          priceInPer1M: m.priceInPer1M,
          priceOutPer1M: m.priceOutPer1M,
          priceCachedInPer1M: m.priceCachedInPer1M,
          toolCallFeeUsd: m.toolCallFeeUsd,
          minCostCredits: m.minCostCredits,
        })),
      })
      setMessage('Models updated.')
      await loadBillingConfig()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to save models')
    } finally {
      setConfigSaving(false)
    }
  }

  const savePolicy = async () => {
    if (!billingConfig) return
    try {
      setConfigSaving(true)
      setError(null)
      setMessage(null)
      await apiClient.put('/admin/billing/policy', {
        creditUsd: billingConfig.policy.creditUsd,
        defaultRetryFactor: billingConfig.policy.defaultRetryFactor,
        defaultPlatformFeeUsd: billingConfig.policy.defaultPlatformFeeUsd,
        minCreditsPerOp: billingConfig.policy.minCreditsPerOp,
      })
      setMessage('Policy updated.')
      await loadBillingConfig()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to save policy')
    } finally {
      setConfigSaving(false)
    }
  }

  const savePlanRules = async () => {
    if (!billingConfig) return
    try {
      setConfigSaving(true)
      setError(null)
      setMessage(null)
      const rules = Object.values(billingConfig.planRules)
      await apiClient.put('/admin/billing/plan-rules', { rules })
      setMessage('Plan rules updated.')
      await loadBillingConfig()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to save plan rules')
    } finally {
      setConfigSaving(false)
    }
  }

  const updateModel = (id: string, updates: Partial<BillingModel>) => {
    setBillingConfig((c) =>
      c
        ? {
            ...c,
            models: c.models.map((m) => (m.id === id ? { ...m, ...updates } : m)),
          }
        : null,
    )
  }

  const updatePolicy = (updates: Partial<BillingPolicySnapshot>) => {
    setBillingConfig((c) =>
      c ? { ...c, policy: { ...c.policy, ...updates } } : null,
    )
  }

  const updatePlanRule = (planId: string, updates: Partial<PlanBillingRuleSnapshot>) => {
    setBillingConfig((c) => {
      if (!c) return null
      const rule = c.planRules[planId]
      if (!rule) return c
      return {
        ...c,
        planRules: { ...c.planRules, [planId]: { ...rule, ...updates } },
      }
    })
  }

  return (
    <>
      <h2 className="admin-page-title">Billing & pricing</h2>
      <div className="admin-billing-main-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          type="button"
          className={`admin-btn ${mainTab === 'paypal' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
          onClick={() => setMainTab('paypal')}
        >
          PayPal & pricing
        </button>
        <button
          type="button"
          className={`admin-btn ${mainTab === 'credits' ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
          onClick={() => setMainTab('credits')}
        >
          Credits & models
        </button>
      </div>
      {message && (
        <div className="admin-notification admin-notification-success" role="alert">
          <span>{message}</span>
          <button type="button" className="admin-notification-dismiss" onClick={() => setMessage(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      {error && (
        <div className="admin-notification admin-notification-error" role="alert">
          <span>{error}</span>
          <button type="button" className="admin-notification-dismiss" onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {mainTab === 'credits' && (
        <>
          {configLoading && <div className="admin-loading">Loading billing config…</div>}
          {!configLoading && billingConfig && (
            <>
              <p className="admin-billing-intro" style={{ marginBottom: '0.5rem' }}>
                Config version: <strong>{billingConfig.version}</strong>. Changes take effect after save.
              </p>
              <div className="admin-billing-credits-subtabs" style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem' }}>
                {(['models', 'plan-rules', 'policy'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`admin-btn ${creditsSubTab === tab ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                    onClick={() => setCreditsSubTab(tab)}
                  >
                    {tab === 'models' ? 'Models' : tab === 'plan-rules' ? 'Plan rules' : 'Policy'}
                  </button>
                ))}
              </div>

              {creditsSubTab === 'models' && (
                <section className="admin-card admin-billing-section">
                  <h3 className="admin-billing-heading">LLM models (pricing)</h3>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Key</th>
                          <th>Provider</th>
                          <th>Enabled</th>
                          <th>Price in/1M</th>
                          <th>Price out/1M</th>
                          <th>Cached in/1M</th>
                          <th>Tool fee USD</th>
                          <th>Min credits</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billingConfig.models.map((m) => (
                          <tr key={m.id}>
                            <td><code>{m.key}</code></td>
                            <td>{m.provider}</td>
                            <td>
                              <input
                                type="checkbox"
                                checked={m.enabled}
                                onChange={(e) => updateModel(m.id, { enabled: e.target.checked })}
                                aria-label={`Enable ${m.key}`}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.000001"
                                className="admin-modal-input"
                                style={{ width: '6rem' }}
                                value={m.priceInPer1M}
                                onChange={(e) => updateModel(m.id, { priceInPer1M: Number(e.target.value) || 0 })}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.000001"
                                className="admin-modal-input"
                                style={{ width: '6rem' }}
                                value={m.priceOutPer1M}
                                onChange={(e) => updateModel(m.id, { priceOutPer1M: Number(e.target.value) || 0 })}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.000001"
                                className="admin-modal-input"
                                style={{ width: '6rem' }}
                                value={m.priceCachedInPer1M ?? ''}
                                onChange={(e) => updateModel(m.id, { priceCachedInPer1M: e.target.value === '' ? null : Number(e.target.value) })}
                                placeholder="—"
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.0001"
                                className="admin-modal-input"
                                style={{ width: '5rem' }}
                                value={m.toolCallFeeUsd ?? ''}
                                onChange={(e) => updateModel(m.id, { toolCallFeeUsd: e.target.value === '' ? null : Number(e.target.value) })}
                                placeholder="—"
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                className="admin-modal-input"
                                style={{ width: '4rem' }}
                                value={m.minCostCredits ?? ''}
                                onChange={(e) => updateModel(m.id, { minCostCredits: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                                placeholder="—"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <button type="button" className="admin-btn admin-btn-primary" onClick={saveModels} disabled={configSaving}>
                      {configSaving ? 'Saving…' : 'Save models'}
                    </button>
                  </div>
                </section>
              )}

              {creditsSubTab === 'policy' && (
                <section className="admin-card admin-billing-section">
                  <h3 className="admin-billing-heading">Billing policy</h3>
                  <div className="admin-billing-grid">
                    <label className="admin-modal-label">
                      Credit USD (per credit)
                      <input
                        type="number"
                        step="0.0001"
                        className="admin-modal-input"
                        value={billingConfig.policy.creditUsd}
                        onChange={(e) => updatePolicy({ creditUsd: Number(e.target.value) || 0 })}
                      />
                    </label>
                    <label className="admin-modal-label">
                      Default retry factor
                      <input
                        type="number"
                        step="0.01"
                        className="admin-modal-input"
                        value={billingConfig.policy.defaultRetryFactor}
                        onChange={(e) => updatePolicy({ defaultRetryFactor: Number(e.target.value) || 1.1 })}
                      />
                    </label>
                    <label className="admin-modal-label">
                      Default platform fee USD
                      <input
                        type="number"
                        step="0.0001"
                        className="admin-modal-input"
                        value={billingConfig.policy.defaultPlatformFeeUsd}
                        onChange={(e) => updatePolicy({ defaultPlatformFeeUsd: Number(e.target.value) || 0 })}
                      />
                    </label>
                  </div>
                  <h4 className="admin-billing-subheading" style={{ marginTop: '1rem' }}>Min credits per op</h4>
                  <div className="admin-billing-grid">
                    {['chat_turn', 'agent_step', 'scan_start', 'report'].map((op) => (
                      <label key={op} className="admin-modal-label">
                        {op}
                        <input
                          type="number"
                          min={0}
                          className="admin-modal-input"
                          value={billingConfig.policy.minCreditsPerOp[op] ?? 0}
                          onChange={(e) =>
                            updatePolicy({
                              minCreditsPerOp: {
                                ...billingConfig.policy.minCreditsPerOp,
                                [op]: parseInt(e.target.value, 10) || 0,
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <button type="button" className="admin-btn admin-btn-primary" onClick={savePolicy} disabled={configSaving}>
                      {configSaving ? 'Saving…' : 'Save policy'}
                    </button>
                  </div>
                </section>
              )}

              {creditsSubTab === 'plan-rules' && (
                <section className="admin-card admin-billing-section">
                  <h3 className="admin-billing-heading">Plan billing rules</h3>
                  {(['FREE', 'PRO', 'PRO_PLUS', 'ULTRA'] as const).map((planId) => {
                    const rule = billingConfig.planRules[planId]
                    if (!rule) return null
                    return (
                      <div key={planId} className="admin-billing-plan-rule-block" style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '4px' }}>
                        <h4 style={{ marginTop: 0 }}>{planId}</h4>
                        <div className="admin-billing-grid">
                          <label className="admin-modal-label">
                            Plan markup
                            <input
                              type="number"
                              step="0.01"
                              className="admin-modal-input"
                              value={rule.planMarkup}
                              onChange={(e) => updatePlanRule(planId, { planMarkup: Number(e.target.value) || 3 })}
                            />
                          </label>
                          <label className="admin-modal-label">
                            Max credits/run
                            <input
                              type="number"
                              min={0}
                              className="admin-modal-input"
                              value={rule.maxCreditsPerRun}
                              onChange={(e) => updatePlanRule(planId, { maxCreditsPerRun: parseInt(e.target.value, 10) || 0 })}
                            />
                          </label>
                          <label className="admin-modal-label">
                            Max tokens/run
                            <input
                              type="number"
                              min={0}
                              className="admin-modal-input"
                              value={rule.maxTokensPerRun}
                              onChange={(e) => updatePlanRule(planId, { maxTokensPerRun: parseInt(e.target.value, 10) || 0 })}
                            />
                          </label>
                          <label className="admin-modal-label">
                            Max steps/run
                            <input
                              type="number"
                              min={0}
                              className="admin-modal-input"
                              value={rule.maxStepsPerRun}
                              onChange={(e) => updatePlanRule(planId, { maxStepsPerRun: parseInt(e.target.value, 10) || 0 })}
                            />
                          </label>
                        </div>
                        <label className="admin-modal-label" style={{ display: 'block', marginTop: '0.5rem' }}>
                          Allowed models (comma-separated keys)
                          <input
                            type="text"
                            className="admin-modal-input"
                            value={(rule.allowedModels || []).join(', ')}
                            onChange={(e) =>
                              updatePlanRule(planId, {
                                allowedModels: e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="deepseek-chat, gpt-4o"
                          />
                        </label>
                      </div>
                    )
                  })}
                  <div style={{ marginTop: '1rem' }}>
                    <button type="button" className="admin-btn admin-btn-primary" onClick={savePlanRules} disabled={configSaving}>
                      {configSaving ? 'Saving…' : 'Save plan rules'}
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}

      {mainTab === 'paypal' && (
        <>
          {loading && <div className="admin-loading">Loading billing settings…</div>}
          {!loading && (
            <>
              <p className="admin-billing-intro">
                Configure PayPal subscriptions and plan prices shown on the Pricing page.
              </p>

              <section className="admin-card admin-billing-section">
                <h3 className="admin-billing-heading">PayPal configuration</h3>
                <div className="admin-billing-grid">
                  <label className="admin-modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.paypalEnabled}
                      onChange={(e) => handleChange('paypalEnabled', e.target.checked)}
                    />
                    <span>Enable PayPal subscriptions</span>
                  </label>
                  <label className="admin-modal-label">
                    Client ID
                    <input
                      type="text"
                      className="admin-modal-input"
                      value={settings.paypalClientId}
                      onChange={(e) => handleChange('paypalClientId', e.target.value)}
                      placeholder="PayPal REST app Client ID"
                    />
                  </label>
                  <label className="admin-modal-label">
                    Client Secret
                    <input
                      type="password"
                      className="admin-modal-input"
                      value={newSecret}
                      onChange={(e) => setNewSecret(e.target.value)}
                      placeholder={settings.paypalClientSecretMasked ? 'Leave blank to keep current' : 'Enter secret'}
                    />
                    {settings.paypalClientSecretMasked && !newSecret && (
                      <span className="admin-billing-hint">Current value is set (masked).</span>
                    )}
                  </label>
                  <label className="admin-modal-label">
                    Mode
                    <select
                      className="admin-modal-select"
                      value={settings.paypalMode}
                      onChange={(e) => handleChange('paypalMode', e.target.value)}
                    >
                      <option value="sandbox">Sandbox</option>
                      <option value="live">Live</option>
                    </select>
                  </label>
                </div>

                <div className="admin-billing-plan-ids">
                  <h4 className="admin-billing-subheading">Plans & prices</h4>
                  <p className="admin-billing-help">
                    Each paid tier needs a PayPal plan ID so users can subscribe. Edit the table below, or create all three
                    plans in PayPal at once with the button. Prices are shown on the public Pricing page.
                  </p>
                  <div className="admin-table-wrap">
                    <table className="admin-table admin-billing-plans-table" aria-label="Subscription plans and PayPal IDs">
                      <thead>
                        <tr>
                          <th>Plan</th>
                          <th className="admin-billing-th-price">Monthly price (USD)</th>
                          <th>PayPal Plan ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><strong>PRO</strong></td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              className="admin-modal-input admin-billing-table-input"
                              value={settings.priceMonthlyPRO}
                              onChange={(e) => handleChange('priceMonthlyPRO', Number(e.target.value) || 0)}
                              aria-label="PRO monthly price USD"
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="admin-modal-input admin-billing-table-input"
                              value={settings.paypalPlanPro}
                              onChange={(e) => handleChange('paypalPlanPro', e.target.value)}
                              placeholder="P-xxx"
                              aria-label="PRO PayPal Plan ID"
                            />
                          </td>
                        </tr>
                        <tr>
                          <td><strong>Pro Plus</strong></td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              className="admin-modal-input admin-billing-table-input"
                              value={settings.priceMonthlyPRO_PLUS}
                              onChange={(e) => handleChange('priceMonthlyPRO_PLUS', Number(e.target.value) || 0)}
                              aria-label="Pro Plus monthly price USD"
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="admin-modal-input admin-billing-table-input"
                              value={settings.paypalPlanProPlus}
                              onChange={(e) => handleChange('paypalPlanProPlus', e.target.value)}
                              placeholder="P-xxx"
                              aria-label="Pro Plus PayPal Plan ID"
                            />
                          </td>
                        </tr>
                        <tr>
                          <td><strong>Ultra</strong></td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              className="admin-modal-input admin-billing-table-input"
                              value={settings.priceMonthlyULTRA}
                              onChange={(e) => handleChange('priceMonthlyULTRA', Number(e.target.value) || 0)}
                              aria-label="Ultra monthly price USD"
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="admin-modal-input admin-billing-table-input"
                              value={settings.paypalPlanUltra}
                              onChange={(e) => handleChange('paypalPlanUltra', e.target.value)}
                              placeholder="P-xxx"
                              aria-label="Ultra PayPal Plan ID"
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="admin-billing-create-row">
                    {hasAllPlanIds ? (
                      <>
                        <button
                          type="button"
                          onClick={handleUpdatePaypalPrices}
                          disabled={updatingPrices || !settings.paypalClientId || !settings.paypalClientSecretMasked}
                          className="admin-btn admin-btn-secondary admin-billing-create-plans-btn"
                        >
                          {updatingPrices ? 'Updating…' : 'Update prices in PayPal'}
                        </button>
                        <span className="admin-billing-hint">
                          Push the current prices from the table above to PayPal. Save billing settings first if you changed prices.
                        </span>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleCreatePaypalPlans}
                          disabled={creatingPlans || !settings.paypalClientId || !settings.paypalClientSecretMasked}
                          className="admin-btn admin-btn-secondary admin-billing-create-plans-btn"
                        >
                          {creatingPlans ? 'Creating…' : 'Create plans in PayPal'}
                        </button>
                        <span className="admin-billing-hint">
                          Uses Client ID, Secret, Mode above and the prices in the table. Saves Plan IDs automatically. Or paste IDs from{' '}
                          <a href="https://developer.paypal.com/dashboard/" target="_blank" rel="noopener noreferrer">PayPal Developer</a>.
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </section>

              <div className="admin-billing-actions">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="admin-btn admin-btn-primary"
                >
                  {saving ? 'Saving…' : 'Save billing settings'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
