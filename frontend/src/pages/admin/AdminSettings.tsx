import { useEffect, useState, useCallback } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

/* ── Types ── */
interface SettingMeta {
  value: string
  hasValue: boolean
  source: 'db' | 'env'
  label: string
  group: string
}

interface GroupMeta {
  label: string
  fields: string[]
}

interface SettingsResponse {
  settings: Record<string, SettingMeta>
  groups: Record<string, GroupMeta>
}

/* ── Toast ── */
type ToastKind = 'success' | 'error'

function useToast() {
  const [toast, setToast] = useState<{ kind: ToastKind; msg: string } | null>(null)
  const show = useCallback((kind: ToastKind, msg: string) => {
    setToast({ kind, msg })
    setTimeout(() => setToast(null), 3500)
  }, [])
  return { toast, show }
}

/* ── Component ── */
export default function AdminSettings() {
  const [data, setData] = useState<SettingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* form state: dirty values keyed by setting name */
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [visible, setVisible] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [savingGroup, setSavingGroup] = useState<string | null>(null)

  const { toast, show: showToast } = useToast()

  /* ── Load ── */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiClient.get('/admin/settings')
        if (!cancelled) setData(res.data)
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.message || e?.message || 'Failed to load settings')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  /* ── Handlers ── */
  const handleChange = (key: string, val: string) => {
    setDrafts((prev) => ({ ...prev, [key]: val }))
  }

  const toggleVisible = (key: string) => {
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const getDisplayValue = (key: string, meta: SettingMeta) => {
    if (key in drafts) return drafts[key]
    return meta.value ?? ''
  }

  const isDirty = (key: string) => key in drafts && drafts[key] !== (data?.settings[key]?.value ?? '')

  const hasDirtyInGroup = (groupKey: string) => {
    if (!data) return false
    const fields = data.groups[groupKey]?.fields ?? []
    return fields.some((f) => isDirty(f))
  }

  /* Save a single group */
  const saveGroup = async (groupKey: string) => {
    if (!data) return
    const fields = data.groups[groupKey]?.fields ?? []
    const payload: Record<string, string> = {}
    for (const f of fields) {
      if (isDirty(f)) payload[f] = drafts[f]
    }
    if (Object.keys(payload).length === 0) return

    setSavingGroup(groupKey)
    try {
      await apiClient.put('/admin/settings', payload)
      /* update local state so fields are no longer dirty */
      setData((prev) => {
        if (!prev) return prev
        const next = { ...prev, settings: { ...prev.settings } }
        for (const [k, v] of Object.entries(payload)) {
          next.settings[k] = { ...next.settings[k], value: v, hasValue: !!v, source: 'db' }
        }
        return next
      })
      setDrafts((prev) => {
        const next = { ...prev }
        for (const k of Object.keys(payload)) delete next[k]
        return next
      })
      showToast('success', `${data.groups[groupKey].label} saved`)
    } catch (e: any) {
      showToast('error', e?.response?.data?.message || e?.message || 'Save failed')
    } finally {
      setSavingGroup(null)
    }
  }

  /* Save all dirty */
  const saveAll = async () => {
    if (!data) return
    const payload: Record<string, string> = {}
    for (const [k, v] of Object.entries(drafts)) {
      if (v !== (data.settings[k]?.value ?? '')) payload[k] = v
    }
    if (Object.keys(payload).length === 0) return

    setSaving(true)
    try {
      await apiClient.put('/admin/settings', payload)
      setData((prev) => {
        if (!prev) return prev
        const next = { ...prev, settings: { ...prev.settings } }
        for (const [k, v] of Object.entries(payload)) {
          next.settings[k] = { ...next.settings[k], value: v, hasValue: !!v, source: 'db' }
        }
        return next
      })
      setDrafts({})
      showToast('success', 'All settings saved')
    } catch (e: any) {
      showToast('error', e?.response?.data?.message || e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  /* ── Group order ── */
  const GROUP_ORDER = ['ai', 'payment', 'email', 'security', 'auth', 'general']

  /* ── Render ── */
  if (loading) return <div className="admin-settings-loading">Loading settings…</div>
  if (error) return <div className="admin-error">{error}</div>
  if (!data) return null

  const totalDirty = Object.keys(drafts).filter((k) => isDirty(k)).length

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className={`admin-toast admin-toast-${toast.kind}`}>{toast.msg}</div>
      )}

      <div className="admin-settings-header">
        <h2 className="admin-page-title">Settings</h2>
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          disabled={saving || totalDirty === 0}
          onClick={saveAll}
        >
          {saving ? 'Saving…' : `Save all${totalDirty > 0 ? ` (${totalDirty})` : ''}`}
        </button>
      </div>

      {GROUP_ORDER.filter((gk) => data.groups[gk]).map((groupKey) => {
        const group = data.groups[groupKey]
        const dirty = hasDirtyInGroup(groupKey)
        return (
          <div key={groupKey} className="admin-card admin-settings-group">
            <div className="admin-settings-group-header">
              <h3 className="admin-settings-group-title">{group.label}</h3>
              <button
                type="button"
                className="admin-btn admin-btn-sm"
                disabled={savingGroup === groupKey || !dirty}
                onClick={() => saveGroup(groupKey)}
              >
                {savingGroup === groupKey ? 'Saving…' : 'Save'}
              </button>
            </div>

            <div className="admin-settings-fields">
              {group.fields.map((fieldKey) => {
                const meta = data.settings[fieldKey]
                if (!meta) return null
                const val = getDisplayValue(fieldKey, meta)
                const fieldVisible = visible.has(fieldKey)
                const dirtyField = isDirty(fieldKey)

                return (
                  <div key={fieldKey} className={`admin-settings-field${dirtyField ? ' dirty' : ''}`}>
                    <label className="admin-settings-label">
                      <span className="admin-settings-label-text">{meta.label || fieldKey}</span>
                      <span className={`admin-settings-source source-${meta.source}`}>
                        {meta.source.toUpperCase()}
                      </span>
                    </label>
                    <div className="admin-settings-input-wrap">
                      <input
                        type={fieldVisible ? 'text' : 'password'}
                        className="admin-settings-input"
                        value={val}
                        placeholder={meta.hasValue ? meta.value : 'Not set'}
                        onChange={(e) => handleChange(fieldKey, e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="admin-settings-eye"
                        onClick={() => toggleVisible(fieldKey)}
                        title={fieldVisible ? 'Hide' : 'Show'}
                        aria-label={fieldVisible ? 'Hide value' : 'Show value'}
                      >
                        {fieldVisible ? '🙈' : '👁'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </>
  )
}
