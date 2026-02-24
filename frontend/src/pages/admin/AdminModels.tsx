import { useState, useEffect } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

interface ModelRow {
  id: string
  name: string
  displayName: string
  provider: string
  pointsPer1kInputTokens: string
  pointsPer1kOutputTokens: string
  isActive: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export default function AdminModels() {
  const [models, setModels] = useState<ModelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [editModal, setEditModal] = useState<ModelRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    displayName: '',
    isActive: true,
    isDefault: false,
    pointsPer1kInputTokens: '',
    pointsPer1kOutputTokens: '',
  })

  const loadModels = async () => {
    try {
      setLoading(true)
      const res = await apiClient.get<{ models: ModelRow[] }>('/admin/models')
      setModels(res.data.models || [])
      setError(null)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to load models')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadModels()
  }, [])

  const openEdit = (row: ModelRow) => {
    setEditModal(row)
    setEditForm({
      displayName: row.displayName,
      isActive: row.isActive,
      isDefault: row.isDefault,
      pointsPer1kInputTokens: row.pointsPer1kInputTokens,
      pointsPer1kOutputTokens: row.pointsPer1kOutputTokens,
    })
    setError(null)
    setMessage(null)
  }

  const saveModel = async () => {
    if (!editModal) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const body: Record<string, unknown> = {
        displayName: editForm.displayName.trim() || editModal.displayName,
        isActive: editForm.isActive,
        isDefault: editForm.isDefault,
      }
      const inputPoints = parseFloat(editForm.pointsPer1kInputTokens)
      const outputPoints = parseFloat(editForm.pointsPer1kOutputTokens)
      if (!Number.isNaN(inputPoints) && inputPoints >= 0) body.pointsPer1kInputTokens = inputPoints
      if (!Number.isNaN(outputPoints) && outputPoints >= 0) body.pointsPer1kOutputTokens = outputPoints
      await apiClient.patch(`/admin/models/${editModal.id}`, body)
      setMessage('Model updated.')
      setEditModal(null)
      await loadModels()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <h2 className="admin-page-title">Models</h2>
      <p className="admin-billing-help">
        Adjust which models are active, the default model, display names, and point costs per 1k tokens. Users see active models in the chat model picker.
      </p>
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

      {loading ? (
        <p className="admin-billing-help">Loading models…</p>
      ) : models.length === 0 ? (
        <p className="admin-billing-help">No models in database. Run seed script if needed (e.g. db:seed-model-options).</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table" aria-label="Models">
            <thead>
              <tr>
                <th>Name</th>
                <th>Display name</th>
                <th>Provider</th>
                <th>Points/1k in</th>
                <th>Points/1k out</th>
                <th>Active</th>
                <th>Default</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {models.map((row) => (
                <tr key={row.id}>
                  <td><code className="admin-payment-tx-code">{row.name}</code></td>
                  <td>{row.displayName}</td>
                  <td>{row.provider}</td>
                  <td>{row.pointsPer1kInputTokens}</td>
                  <td>{row.pointsPer1kOutputTokens}</td>
                  <td>{row.isActive ? 'Yes' : 'No'}</td>
                  <td>{row.isDefault ? 'Yes' : '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                      onClick={() => openEdit(row)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editModal && (
        <div className="admin-modal-backdrop" onClick={() => !saving && setEditModal(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">Edit model</h3>
              <p className="admin-modal-subtitle" style={{ margin: 0 }}>{editModal.name}</p>
            </div>
            <div className="admin-modal-body">
              <label className="admin-modal-label">
                Display name
                <input
                  type="text"
                  className="admin-modal-input"
                  value={editForm.displayName}
                  onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="e.g. GPT-4"
                />
              </label>
              <label className="admin-modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                <span>Active (shown in model picker)</span>
              </label>
              <label className="admin-modal-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editForm.isDefault}
                  onChange={(e) => setEditForm((f) => ({ ...f, isDefault: e.target.checked }))}
                />
                <span>Default model</span>
              </label>
              <label className="admin-modal-label">
                Points per 1k input tokens
                <input
                  type="text"
                  className="admin-modal-input"
                  value={editForm.pointsPer1kInputTokens}
                  onChange={(e) => setEditForm((f) => ({ ...f, pointsPer1kInputTokens: e.target.value }))}
                  placeholder="0"
                />
              </label>
              <label className="admin-modal-label">
                Points per 1k output tokens
                <input
                  type="text"
                  className="admin-modal-input"
                  value={editForm.pointsPer1kOutputTokens}
                  onChange={(e) => setEditForm((f) => ({ ...f, pointsPer1kOutputTokens: e.target.value }))}
                  placeholder="0"
                />
              </label>
              <div className="admin-modal-actions" style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  disabled={saving}
                  onClick={saveModel}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  disabled={saving}
                  onClick={() => setEditModal(null)}
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
