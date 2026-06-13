import { useState, useEffect, useCallback, useMemo } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Provider = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'custom'

interface ModelRow {
  id: string
  name: string
  displayName: string
  provider: Provider
  apiModelId: string | null
  pointsPer1kInputTokens: string
  pointsPer1kOutputTokens: string
  isActive: boolean
  isDefault: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

interface ModelForm {
  name: string
  displayName: string
  provider: Provider
  apiModelId: string
  apiKey: string
  pointsPer1kInputTokens: string
  pointsPer1kOutputTokens: string
  isActive: boolean
  isDefault: boolean
}

const emptyForm: ModelForm = {
  name: '',
  displayName: '',
  provider: 'openai',
  apiModelId: '',
  apiKey: '',
  pointsPer1kInputTokens: '0',
  pointsPer1kOutputTokens: '0',
  isActive: true,
  isDefault: false,
}

const PROVIDERS: { value: Provider; label: string; icon: string; color: string }[] = [
  { value: 'openai', label: 'OpenAI', icon: 'fa-brain', color: 'oklch(0.72 0.15 145)' },
  { value: 'anthropic', label: 'Anthropic', icon: 'fa-feather-pointed', color: 'oklch(0.7 0.15 30)' },
  { value: 'google', label: 'Google', icon: 'fa-gem', color: 'oklch(0.7 0.15 250)' },
  { value: 'deepseek', label: 'DeepSeek', icon: 'fa-water', color: 'oklch(0.7 0.15 200)' },
  { value: 'custom', label: 'Custom', icon: 'fa-puzzle-piece', color: 'oklch(0.65 0.1 280)' },
]

const providerMeta = Object.fromEntries(PROVIDERS.map((p) => [p.value, p])) as Record<Provider, (typeof PROVIDERS)[number]>

function rowToForm(row: ModelRow): ModelForm {
  return {
    name: row.name,
    displayName: row.displayName,
    provider: row.provider,
    apiModelId: row.apiModelId ?? '',
    apiKey: '',
    pointsPer1kInputTokens: row.pointsPer1kInputTokens,
    pointsPer1kOutputTokens: row.pointsPer1kOutputTokens,
    isActive: row.isActive,
    isDefault: row.isDefault,
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminModels() {
  const [models, setModels] = useState<ModelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Modal: null = closed, 'create' = new, ModelRow = editing
  const [modal, setModal] = useState<'create' | ModelRow | null>(null)
  const [form, setForm] = useState<ModelForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ModelRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  /* ---- fetch ---- */
  const loadModels = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await apiClient.get<{ models: ModelRow[] }>('/admin/models')
      setModels(Array.isArray(res.data?.models) ? res.data.models : [])
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to load models')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadModels() }, [loadModels])

  /* ---- group by provider ---- */
  const grouped = useMemo(() => {
    const map = new Map<Provider, ModelRow[]>()
    for (const m of models) {
      if (!map.has(m.provider)) map.set(m.provider, [])
      map.get(m.provider)!.push(m)
    }
    return map
  }, [models])

  const providerOrder: Provider[] = ['openai', 'anthropic', 'google', 'deepseek', 'custom']
  const sortedProviders = providerOrder.filter((p) => grouped.has(p))

  /* ---- helpers ---- */
  const updateForm = (patch: Partial<ModelForm>) => setForm((f) => ({ ...f, ...patch }))

  const openCreate = () => {
    setForm(emptyForm)
    setModal('create')
    setError(null)
    setMessage(null)
  }

  const openEdit = (row: ModelRow) => {
    setForm(rowToForm(row))
    setModal(row)
    setError(null)
    setMessage(null)
  }

  const closeModal = () => { if (!saving) setModal(null) }

  /* ---- save (create / update) ---- */
  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const inputPts = parseFloat(form.pointsPer1kInputTokens)
      const outputPts = parseFloat(form.pointsPer1kOutputTokens)

      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        displayName: form.displayName.trim() || form.name.trim(),
        provider: form.provider,
        apiModelId: form.apiModelId.trim() || null,
        isActive: form.isActive,
        isDefault: form.isDefault,
        pointsPer1kInputTokens: Number.isNaN(inputPts) ? 0 : inputPts,
        pointsPer1kOutputTokens: Number.isNaN(outputPts) ? 0 : outputPts,
      }

      // Only include apiKey if user typed one
      if (form.apiKey.trim()) {
        payload.apiKey = form.apiKey.trim()
      }

      if (modal === 'create') {
        await apiClient.post('/admin/models', payload)
        setMessage('Model created successfully.')
      } else if (modal) {
        await apiClient.put(`/admin/models/${modal.id}`, payload)
        setMessage('Model updated successfully.')
      }
      setModal(null)
      await loadModels()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to save model')
    } finally {
      setSaving(false)
    }
  }

  /* ---- toggle active ---- */
  const handleToggle = async (row: ModelRow) => {
    try {
      await apiClient.put(`/admin/models/${row.id}/toggle`)
      await loadModels()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to toggle model')
    }
  }

  /* ---- delete ---- */
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    setMessage(null)
    try {
      await apiClient.delete(`/admin/models/${deleteTarget.id}`)
      setMessage(`Model "${deleteTarget.displayName}" deleted.`)
      setDeleteTarget(null)
      await loadModels()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to delete model')
    } finally {
      setDeleting(false)
    }
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 className="admin-page-title" style={{ margin: 0 }}>
          <i className="fa-solid fa-microchip" style={{ marginRight: '0.5rem', opacity: 0.7 }} />
          Models
        </h2>
        <button type="button" className="admin-btn admin-btn-primary" onClick={openCreate}>
          <i className="fa-solid fa-plus" style={{ marginRight: '0.4rem' }} />
          New model
        </button>
      </div>

      <p className="admin-billing-help" style={{ marginBottom: '1rem' }}>
        Manage AI models: providers, pricing, availability, and defaults. Toggle active status inline. Users see active models in the chat model picker.
      </p>

      {/* Notifications */}
      {message && (
        <div className="admin-notification admin-notification-success" role="alert">
          <i className="fa-solid fa-circle-check" style={{ marginRight: '0.5rem' }} />
          <span>{message}</span>
          <button type="button" className="admin-notification-dismiss" onClick={() => setMessage(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      {error && (
        <div className="admin-notification admin-notification-error" role="alert">
          <i className="fa-solid fa-circle-exclamation" style={{ marginRight: '0.5rem' }} />
          <span>{error}</span>
          <button type="button" className="admin-notification-dismiss" onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <p className="admin-billing-help">
          <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '0.5rem' }} />
          Loading models…
        </p>
      ) : models.length === 0 ? (
        <div className="admin-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <i className="fa-solid fa-inbox" style={{ fontSize: '2rem', opacity: 0.4, display: 'block', marginBottom: '0.75rem' }} />
          <p className="admin-billing-help" style={{ margin: 0 }}>No models found. Add one to get started.</p>
        </div>
      ) : (
        sortedProviders.map((provider) => {
          const meta = providerMeta[provider]
          const rows = grouped.get(provider) || []
          return (
            <div key={provider} style={{ marginBottom: '1.5rem' }}>
              {/* Provider group header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.5rem',
                padding: '0.4rem 0',
              }}>
                <i className={`fa-solid ${meta.icon}`} style={{ color: meta.color, fontSize: '0.95rem' }} />
                <span style={{
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: meta.color,
                }}>
                  {meta.label}
                </span>
                <span style={{
                  fontSize: '0.7rem',
                  color: 'oklch(0.55 0 0)',
                  marginLeft: '0.25rem',
                }}>
                  ({rows.length})
                </span>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table" aria-label={`${meta.label} models`}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>API Model ID</th>
                      <th>Points/1k In</th>
                      <th>Points/1k Out</th>
                      <th>Default</th>
                      <th>Active</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} style={{ opacity: row.isActive ? 1 : 0.55 }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <i className={`fa-solid ${meta.icon}`} style={{ color: meta.color, fontSize: '0.75rem', opacity: 0.7 }} />
                            <span style={{ fontWeight: 600 }}>{row.displayName}</span>
                          </div>
                          <code style={{ fontSize: '0.7rem', color: 'oklch(0.55 0 0)', display: 'block', marginTop: '0.15rem' }}>{row.name}</code>
                        </td>
                        <td>
                          {row.apiModelId ? (
                            <code className="admin-payment-tx-code">{row.apiModelId}</code>
                          ) : (
                            <span style={{ color: 'oklch(0.45 0 0)', fontSize: '0.8rem' }}>—</span>
                          )}
                        </td>
                        <td>{row.pointsPer1kInputTokens}</td>
                        <td>{row.pointsPer1kOutputTokens}</td>
                        <td>
                          {row.isDefault ? (
                            <span style={{ color: 'oklch(0.72 0.15 145)', fontWeight: 600 }}>
                              <i className="fa-solid fa-star" style={{ marginRight: '0.3rem' }} />
                              Default
                            </span>
                          ) : (
                            <span style={{ color: 'oklch(0.45 0 0)', fontSize: '0.8rem' }}>—</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleToggle(row)}
                            title={row.isActive ? 'Deactivate model' : 'Activate model'}
                            style={{
                              background: row.isActive ? 'oklch(0.25 0.08 145 / 0.3)' : 'oklch(0.2 0 0)',
                              border: `1px solid ${row.isActive ? 'oklch(0.45 0.12 145 / 0.5)' : 'oklch(0.3 0 0)'}`,
                              borderRadius: '999px',
                              padding: '0.2rem 0.6rem',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontSize: '0.78rem',
                              color: row.isActive ? 'oklch(0.78 0.12 145)' : 'oklch(0.55 0 0)',
                              transition: 'all 0.15s',
                            }}
                          >
                            <span style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: row.isActive ? 'oklch(0.72 0.18 145)' : 'oklch(0.4 0 0)',
                              display: 'inline-block',
                            }} />
                            {row.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              type="button"
                              className="admin-btn admin-btn-secondary admin-btn-sm"
                              onClick={() => openEdit(row)}
                              title="Edit model"
                            >
                              <i className="fa-solid fa-pen-to-square" />
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn-secondary admin-btn-sm"
                              style={{ color: 'oklch(0.65 0.18 25)' }}
                              onClick={() => setDeleteTarget(row)}
                              title="Delete model"
                            >
                              <i className="fa-solid fa-trash" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}

      {/* ============================================================== */}
      {/*  Create / Edit Modal                                            */}
      {/* ============================================================== */}
      {modal && (
        <div className="admin-modal-backdrop" onClick={closeModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">
                {modal === 'create' ? (
                  <><i className="fa-solid fa-plus" style={{ marginRight: '0.5rem' }} />New model</>
                ) : (
                  <><i className="fa-solid fa-pen-to-square" style={{ marginRight: '0.5rem' }} />Edit model</>
                )}
              </h3>
              {modal !== 'create' && (
                <p className="admin-modal-subtitle" style={{ margin: 0 }}>{(modal as ModelRow).name}</p>
              )}
            </div>
            <div className="admin-modal-body">
              {/* Name */}
              <label className="admin-modal-label">
                <i className="fa-solid fa-tag" style={{ marginRight: '0.3rem', opacity: 0.6 }} />
                Model name (unique identifier)
                <input
                  type="text"
                  className="admin-modal-input"
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="e.g. gpt-4o, claude-sonnet-4-20250514"
                  disabled={modal !== 'create'}
                  style={modal !== 'create' ? { opacity: 0.6 } : undefined}
                />
              </label>

              {/* Display name */}
              <label className="admin-modal-label">
                <i className="fa-solid fa-font" style={{ marginRight: '0.3rem', opacity: 0.6 }} />
                Display name
                <input
                  type="text"
                  className="admin-modal-input"
                  value={form.displayName}
                  onChange={(e) => updateForm({ displayName: e.target.value })}
                  placeholder="e.g. GPT-4o, Claude Sonnet 4"
                />
              </label>

              {/* Provider */}
              <label className="admin-modal-label">
                <i className="fa-solid fa-server" style={{ marginRight: '0.3rem', opacity: 0.6 }} />
                Provider
                <select
                  className="admin-modal-select"
                  value={form.provider}
                  onChange={(e) => updateForm({ provider: e.target.value as Provider })}
                  disabled={modal !== 'create'}
                  style={modal !== 'create' ? { opacity: 0.6 } : undefined}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </label>

              {/* API Model ID */}
              <label className="admin-modal-label">
                <i className="fa-solid fa-fingerprint" style={{ marginRight: '0.3rem', opacity: 0.6 }} />
                API Model ID (actual model ID for provider API)
                <input
                  type="text"
                  className="admin-modal-input"
                  value={form.apiModelId}
                  onChange={(e) => updateForm({ apiModelId: e.target.value })}
                  placeholder="e.g. gpt-4-turbo, claude-3-opus — leave blank to use name"
                />
              </label>

              {/* API Key (create only) */}
              {modal === 'create' && (
                <label className="admin-modal-label">
                  <i className="fa-solid fa-key" style={{ marginRight: '0.3rem', opacity: 0.6 }} />
                  API Key (optional)
                  <input
                    type="password"
                    className="admin-modal-input"
                    value={form.apiKey}
                    onChange={(e) => updateForm({ apiKey: e.target.value })}
                    placeholder="sk-..."
                  />
                </label>
              )}

              {/* Points row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label className="admin-modal-label">
                  <i className="fa-solid fa-coins" style={{ marginRight: '0.3rem', opacity: 0.6 }} />
                  Points/1k input tokens
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="admin-modal-input"
                    value={form.pointsPer1kInputTokens}
                    onChange={(e) => updateForm({ pointsPer1kInputTokens: e.target.value })}
                    placeholder="0"
                  />
                </label>
                <label className="admin-modal-label">
                  <i className="fa-solid fa-coins" style={{ marginRight: '0.3rem', opacity: 0.6 }} />
                  Points/1k output tokens
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="admin-modal-input"
                    value={form.pointsPer1kOutputTokens}
                    onChange={(e) => updateForm({ pointsPer1kOutputTokens: e.target.value })}
                    placeholder="0"
                  />
                </label>
              </div>

              {/* Toggles */}
              <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
                <label className="admin-modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => updateForm({ isActive: e.target.checked })}
                  />
                  <span>Active (shown in model picker)</span>
                </label>
                <label className="admin-modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={(e) => updateForm({ isDefault: e.target.checked })}
                  />
                  <span>
                    <i className="fa-solid fa-star" style={{ marginRight: '0.2rem', opacity: 0.6 }} />
                    Default for provider
                  </span>
                </label>
              </div>

              {/* Actions */}
              <div className="admin-modal-actions" style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  disabled={saving || !form.name.trim()}
                  onClick={handleSave}
                >
                  {saving ? (
                    <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '0.4rem' }} />Saving…</>
                  ) : modal === 'create' ? (
                    <><i className="fa-solid fa-plus" style={{ marginRight: '0.4rem' }} />Create model</>
                  ) : (
                    <><i className="fa-solid fa-check" style={{ marginRight: '0.4rem' }} />Save changes</>
                  )}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  disabled={saving}
                  onClick={closeModal}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/*  Delete Confirmation Modal                                      */}
      {/* ============================================================== */}
      {deleteTarget && (
        <div className="admin-modal-backdrop" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">
                <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: '0.5rem', color: 'oklch(0.7 0.18 25)' }} />
                Delete model
              </h3>
            </div>
            <div className="admin-modal-body">
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: 'oklch(0.88 0.003 60)' }}>
                Are you sure you want to delete <strong>{deleteTarget.displayName}</strong>?
              </p>
              <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'oklch(0.62 0.005 60)' }}>
                <code>{deleteTarget.name}</code> · {deleteTarget.provider}
              </p>
              <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'oklch(0.65 0.15 25)' }}>
                <i className="fa-solid fa-circle-info" style={{ marginRight: '0.3rem' }} />
                If this model has usage history, deletion will be blocked. Deactivate it instead.
              </p>
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="admin-btn"
                  style={{ background: 'oklch(0.45 0.18 25)', color: 'oklch(1 0 0)' }}
                  disabled={deleting}
                  onClick={handleDelete}
                >
                  {deleting ? (
                    <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '0.4rem' }} />Deleting…</>
                  ) : (
                    <><i className="fa-solid fa-trash" style={{ marginRight: '0.4rem' }} />Delete</>
                  )}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  disabled={deleting}
                  onClick={() => setDeleteTarget(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
