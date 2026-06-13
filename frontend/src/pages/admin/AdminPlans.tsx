import { useState, useEffect, useCallback } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PlanRow {
  id: string
  code: string
  name: string
  description: string | null
  monthlyPriceUsd: number | null
  pointsIncluded: number | null
  reportsIncluded: number | null
  isRecurring: boolean
  isActive: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

interface PlanForm {
  code: string
  name: string
  description: string
  monthlyPriceUsd: string
  pointsIncluded: string
  reportsIncluded: string
  isRecurring: boolean
  isActive: boolean
  features: string
  scanLimit: string
  modelAccess: string
}

const emptyForm: PlanForm = {
  code: '',
  name: '',
  description: '',
  monthlyPriceUsd: '',
  pointsIncluded: '',
  reportsIncluded: '',
  isRecurring: false,
  isActive: true,
  features: '',
  scanLimit: '',
  modelAccess: '',
}

function rowToForm(row: PlanRow): PlanForm {
  const meta = row.metadata ?? {}
  const features = Array.isArray(meta.features) ? (meta.features as string[]).join('\n') : ''
  const scanLimit = meta.sessions_per_day != null ? String(meta.sessions_per_day) : ''
  const modelAccess = Array.isArray(meta.allowedModels) ? (meta.allowedModels as string[]).join(', ') : ''
  return {
    code: row.code,
    name: row.name,
    description: row.description ?? '',
    monthlyPriceUsd: row.monthlyPriceUsd != null ? String(row.monthlyPriceUsd) : '',
    pointsIncluded: row.pointsIncluded != null ? String(row.pointsIncluded) : '',
    reportsIncluded: row.reportsIncluded != null ? String(row.reportsIncluded) : '',
    isRecurring: row.isRecurring,
    isActive: row.isActive,
    features,
    scanLimit,
    modelAccess,
  }
}

function formToPayload(f: PlanForm): Record<string, unknown> {
  const features = f.features.split('\n').map((s) => s.trim()).filter(Boolean)
  const allowedModels = f.modelAccess.split(',').map((s) => s.trim()).filter(Boolean)
  const metadata: Record<string, unknown> = {}
  if (features.length) metadata.features = features
  if (f.scanLimit.trim()) metadata.sessions_per_day = Number(f.scanLimit) || -1
  if (allowedModels.length) metadata.allowedModels = allowedModels

  return {
    code: f.code.trim().toUpperCase(),
    name: f.name.trim(),
    description: f.description.trim() || null,
    monthlyPriceUsd: f.monthlyPriceUsd.trim() ? Number(f.monthlyPriceUsd) : null,
    pointsIncluded: f.pointsIncluded.trim() ? Number(f.pointsIncluded) : null,
    reportsIncluded: f.reportsIncluded.trim() ? Number(f.reportsIncluded) : null,
    isRecurring: f.isRecurring,
    isActive: f.isActive,
    metadata: Object.keys(metadata).length ? metadata : null,
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminPlans() {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Modal state: null = closed, 'create' = new plan, PlanRow = editing
  const [modal, setModal] = useState<'create' | PlanRow | null>(null)
  const [form, setForm] = useState<PlanForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<PlanRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  /* ---- fetch ---- */
  const loadPlans = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await apiClient.get<PlanRow[]>('/admin/plans')
      setPlans(Array.isArray(res.data) ? res.data : [])
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to load plans')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPlans() }, [loadPlans])

  /* ---- helpers ---- */
  const updateForm = (patch: Partial<PlanForm>) => setForm((f) => ({ ...f, ...patch }))

  const openCreate = () => {
    setForm(emptyForm)
    setModal('create')
    setError(null)
    setMessage(null)
  }

  const openEdit = (row: PlanRow) => {
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
      const payload = formToPayload(form)
      if (modal === 'create') {
        await apiClient.post('/admin/plans', payload)
        setMessage('Plan created successfully.')
      } else if (modal) {
        await apiClient.patch(`/admin/plans/${modal.id}`, payload)
        setMessage('Plan updated successfully.')
      }
      setModal(null)
      await loadPlans()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to save plan')
    } finally {
      setSaving(false)
    }
  }

  /* ---- delete ---- */
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setError(null)
    setMessage(null)
    try {
      await apiClient.delete(`/admin/plans/${deleteTarget.id}`)
      setMessage(`Plan "${deleteTarget.name}" deleted.`)
      setDeleteTarget(null)
      await loadPlans()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to delete plan')
    } finally {
      setDeleting(false)
    }
  }

  /* ---- format helpers ---- */
  const fmtPrice = (v: number | null) => v != null ? `$${Number(v).toFixed(2)}` : '—'
  const fmtNum = (v: number | null) => v != null ? String(v) : '—'
  const fmtFeatures = (meta: Record<string, unknown> | null) => {
    if (!meta) return '—'
    const f = meta.features
    if (!Array.isArray(f) || f.length === 0) return '—'
    return f.join(', ')
  }
  const fmtModels = (meta: Record<string, unknown> | null) => {
    if (!meta) return 'All'
    const m = meta.allowedModels
    if (!Array.isArray(m) || m.length === 0) return 'All'
    return m.join(', ')
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 className="admin-page-title" style={{ margin: 0 }}>
          <i className="fa-solid fa-tags" style={{ marginRight: '0.5rem', opacity: 0.7 }} />
          Plans
        </h2>
        <button type="button" className="admin-btn admin-btn-primary" onClick={openCreate}>
          <i className="fa-solid fa-plus" style={{ marginRight: '0.4rem' }} />
          New plan
        </button>
      </div>

      <p className="admin-billing-help" style={{ marginBottom: '1rem' }}>
        Manage subscription plans: pricing, feature lists, scan limits, and model access. Changes take effect immediately.
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

      {/* Table */}
      {loading ? (
        <p className="admin-billing-help">
          <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '0.5rem' }} />
          Loading plans…
        </p>
      ) : plans.length === 0 ? (
        <div className="admin-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <i className="fa-solid fa-inbox" style={{ fontSize: '2rem', opacity: 0.4, display: 'block', marginBottom: '0.75rem' }} />
          <p className="admin-billing-help" style={{ margin: 0 }}>No plans found. Create one to get started.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table" aria-label="Plans">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Price / mo</th>
                <th>Points</th>
                <th>Scan limit</th>
                <th>Features</th>
                <th>Model access</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((row) => (
                <tr key={row.id}>
                  <td><code className="admin-payment-tx-code">{row.code}</code></td>
                  <td style={{ fontWeight: 600 }}>{row.name}</td>
                  <td>{fmtPrice(row.monthlyPriceUsd)}</td>
                  <td>{fmtNum(row.pointsIncluded)}</td>
                  <td>
                    {row.metadata?.sessions_per_day != null
                      ? (row.metadata.sessions_per_day === -1 ? 'Unlimited' : `${row.metadata.sessions_per_day}/day`)
                      : '—'}
                  </td>
                  <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fmtFeatures(row.metadata)}
                  </td>
                  <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fmtModels(row.metadata)}
                  </td>
                  <td>
                    {row.isActive ? (
                      <span style={{ color: 'oklch(0.72 0.15 145)' }}>
                        <i className="fa-solid fa-circle-check" /> Yes
                      </span>
                    ) : (
                      <span style={{ color: 'oklch(0.55 0 0)' }}>
                        <i className="fa-solid fa-circle-xmark" /> No
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        onClick={() => openEdit(row)}
                        title="Edit plan"
                      >
                        <i className="fa-solid fa-pen-to-square" />
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-secondary admin-btn-sm"
                        style={{ color: 'oklch(0.65 0.18 25)' }}
                        onClick={() => setDeleteTarget(row)}
                        title="Delete plan"
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
      )}

      {/* ============================================================== */}
      {/*  Create / Edit Modal                                            */}
      {/* ============================================================== */}
      {modal && (
        <div className="admin-modal-backdrop" onClick={closeModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">
                {modal === 'create' ? (
                  <><i className="fa-solid fa-plus" style={{ marginRight: '0.5rem' }} />New plan</>
                ) : (
                  <><i className="fa-solid fa-pen-to-square" style={{ marginRight: '0.5rem' }} />Edit plan</>
                )}
              </h3>
              {modal !== 'create' && (
                <p className="admin-modal-subtitle" style={{ margin: 0 }}>{(modal as PlanRow).code}</p>
              )}
            </div>
            <div className="admin-modal-body">
              {/* Code */}
              <label className="admin-modal-label">
                Plan code
                <input
                  type="text"
                  className="admin-modal-input"
                  value={form.code}
                  onChange={(e) => updateForm({ code: e.target.value })}
                  placeholder="e.g. PRO, ULTRA"
                  disabled={modal !== 'create'}
                  style={modal !== 'create' ? { opacity: 0.6 } : undefined}
                />
              </label>

              {/* Name */}
              <label className="admin-modal-label">
                Name
                <input
                  type="text"
                  className="admin-modal-input"
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="e.g. Pro, Ultra"
                />
              </label>

              {/* Description */}
              <label className="admin-modal-label">
                Description
                <textarea
                  className="admin-modal-input"
                  value={form.description}
                  onChange={(e) => updateForm({ description: e.target.value })}
                  placeholder="Short description (optional)"
                  rows={2}
                  style={{ resize: 'vertical' }}
                />
              </label>

              {/* Price + Points row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label className="admin-modal-label">
                  Monthly price (USD)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="admin-modal-input"
                    value={form.monthlyPriceUsd}
                    onChange={(e) => updateForm({ monthlyPriceUsd: e.target.value })}
                    placeholder="0.00"
                  />
                </label>
                <label className="admin-modal-label">
                  Points included
                  <input
                    type="number"
                    min="0"
                    className="admin-modal-input"
                    value={form.pointsIncluded}
                    onChange={(e) => updateForm({ pointsIncluded: e.target.value })}
                    placeholder="0"
                  />
                </label>
              </div>

              {/* Scan limit + Reports */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label className="admin-modal-label">
                  <i className="fa-solid fa-bolt" style={{ marginRight: '0.3rem', opacity: 0.6 }} />
                  Scan limit (sessions/day)
                  <input
                    type="number"
                    min="-1"
                    className="admin-modal-input"
                    value={form.scanLimit}
                    onChange={(e) => updateForm({ scanLimit: e.target.value })}
                    placeholder="-1 = unlimited"
                  />
                </label>
                <label className="admin-modal-label">
                  Reports included
                  <input
                    type="number"
                    min="0"
                    className="admin-modal-input"
                    value={form.reportsIncluded}
                    onChange={(e) => updateForm({ reportsIncluded: e.target.value })}
                    placeholder="0"
                  />
                </label>
              </div>

              {/* Features */}
              <label className="admin-modal-label">
                <i className="fa-solid fa-list-check" style={{ marginRight: '0.3rem', opacity: 0.6 }} />
                Features (one per line)
                <textarea
                  className="admin-modal-input"
                  value={form.features}
                  onChange={(e) => updateForm({ features: e.target.value })}
                  placeholder={"Unlimited steps\n5 concurrent targets\nSpawn up to 3 sub-agents"}
                  rows={4}
                  style={{ resize: 'vertical' }}
                />
              </label>

              {/* Model access */}
              <label className="admin-modal-label">
                <i className="fa-solid fa-microchip" style={{ marginRight: '0.3rem', opacity: 0.6 }} />
                Model access (comma-separated, blank = all)
                <input
                  type="text"
                  className="admin-modal-input"
                  value={form.modelAccess}
                  onChange={(e) => updateForm({ modelAccess: e.target.value })}
                  placeholder="e.g. gpt-4o, claude-sonnet-4-20250514"
                />
              </label>

              {/* Toggles */}
              <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
                <label className="admin-modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => updateForm({ isActive: e.target.checked })}
                  />
                  <span>Active</span>
                </label>
                <label className="admin-modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.isRecurring}
                    onChange={(e) => updateForm({ isRecurring: e.target.checked })}
                  />
                  <span>Recurring billing</span>
                </label>
              </div>

              {/* Actions */}
              <div className="admin-modal-actions" style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  disabled={saving || !form.code.trim() || !form.name.trim()}
                  onClick={handleSave}
                >
                  {saving ? (
                    <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '0.4rem' }} />Saving…</>
                  ) : modal === 'create' ? (
                    <><i className="fa-solid fa-plus" style={{ marginRight: '0.4rem' }} />Create plan</>
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
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">
                <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: '0.5rem', color: 'oklch(0.65 0.18 25)' }} />
                Delete plan
              </h3>
            </div>
            <div className="admin-modal-body">
              <p style={{ margin: '0 0 1rem', color: 'oklch(0.85 0 0)', lineHeight: 1.5 }}>
                Are you sure you want to delete <strong>{deleteTarget.name}</strong> (<code>{deleteTarget.code}</code>)?
                This action cannot be undone.
              </p>
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="admin-btn"
                  style={{ background: 'oklch(0.45 0.18 25)', color: '#fff' }}
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
