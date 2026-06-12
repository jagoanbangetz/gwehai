import { useEffect, useState, useCallback, useMemo } from 'react'
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

/* ── Group visual config ── */
const GROUP_CONFIG: Record<string, { icon: string; color: string; description: string }> = {
  ai:       { icon: 'fa-brain',           color: 'oklch(0.55 0.15 280)',  description: 'AI model keys & inference settings' },
  payment:  { icon: 'fa-credit-card',     color: 'oklch(0.55 0.15 160)',  description: 'Payment gateway & billing config' },
  email:    { icon: 'fa-envelope',        color: 'oklch(0.6 0.14 220)',   description: 'SMTP & email delivery settings' },
  security: { icon: 'fa-shield-halved',   color: 'oklch(0.55 0.14 25)',   description: 'Encryption, secrets & access control' },
  auth:     { icon: 'fa-key',             color: 'oklch(0.6 0.14 60)',    description: 'Authentication & OAuth providers' },
  general:  { icon: 'fa-sliders',         color: 'oklch(0.6 0.04 60)',    description: 'General application settings' },
  branding: { icon: 'fa-palette',          color: 'oklch(0.55 0.15 40)',   description: 'Logo, favicon and visual identity' },
}

/* ── Field descriptions ── */
const FIELD_DESCRIPTIONS: Record<string, string> = {
  OPENAI_API_KEY:           'Your OpenAI API key (sk-...). Used for GPT-4o and GPT-4 inference.',
  OPENAI_MODEL:             'Default model for chat completions.',
  DEEPSEEK_API_KEY:         'DeepSeek API key for code-focused models.',
  DEEPSEEK_BASE_URL:        'Custom base URL for DeepSeek API.',
  DEEPSEEK_MODEL:           'DeepSeek model identifier.',
  XAI_API_KEY:              'xAI (Grok) API key.',
  XAI_MODEL:                'Grok model identifier.',
  GEMINI_API_KEY:           'Google Gemini API key.',
  GEMINI_MODEL:             'Gemini model identifier.',
  STRIPE_SECRET_KEY:        'Stripe secret key (sk_live_... or sk_test_...).',
  STRIPE_PUBLISHABLE_KEY:   'Stripe publishable key for client-side.',
  STRIPE_WEBHOOK_SECRET:    'Webhook signing secret from Stripe dashboard.',
  MAIL_MAILER:              'Mail driver: smtp, ses, log, etc.',
  MAIL_HOST:                'SMTP server hostname.',
  MAIL_PORT:                'SMTP server port (587 for TLS, 465 for SSL).',
  MAIL_USERNAME:            'SMTP auth username.',
  MAIL_PASSWORD:            'SMTP auth password.',
  MAIL_FROM_ADDRESS:        'Sender email address.',
  MAIL_ENCRYPTION:          'Encryption protocol: tls or ssl.',
  APP_KEY:                  'Laravel application encryption key.',
  APP_ENV:                  'Application environment: production, staging, local.',
  APP_DEBUG:                'Enable/disable debug mode.',
  APP_URL:                  'Public-facing application URL.',
  APP_NAME:                 'Application display name.',
  SESSION_DRIVER:           'Session storage driver: file, redis, database.',
  CACHE_DRIVER:             'Cache backend: file, redis, memcached.',
  site_logo_url:            'Site logo image URL. Upload a PNG/JPG/SVG. Displayed in header and login page.',
  site_favicon_url:         'Browser favicon. Upload an ICO/PNG. Displayed in browser tab.',
}

/* ── Boolean field detection ── */
const BOOLEAN_FIELDS = new Set([
  'APP_DEBUG', 'MAIL_ENCRYPTION',
])

function isBooleanField(key: string, meta: SettingMeta): boolean {
  if (BOOLEAN_FIELDS.has(key)) return true
  const v = (meta.value ?? '').toLowerCase()
  return v === 'true' || v === 'false'
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

/* ── Toggle Switch ── */
function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (val: string) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`settings-toggle ${checked ? 'on' : 'off'}${disabled ? ' disabled' : ''}`}
      onClick={() => onChange(checked ? 'false' : 'true')}
      disabled={disabled}
    >
      <span className="settings-toggle-knob" />
    </button>
  )
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

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

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
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

  const dirtyCountInGroup = (groupKey: string) => {
    if (!data) return 0
    const fields = data.groups[groupKey]?.fields ?? []
    return fields.filter((f) => isDirty(f)).length
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

  const [uploading, setUploading] = useState<string | null>(null) // fieldKey being uploaded
  const [uploadPreview, setUploadPreview] = useState<Record<string, string>>({})

  const handleUpload = async (fieldKey: string, file: File) => {
    const type = fieldKey === 'site_logo_url' ? 'logo' : 'favicon'
    setUploading(fieldKey)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', type)
      const res = await apiClient.post('/admin/settings/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const url = res.data?.url
      if (url) {
        setUploadPreview(prev => ({ ...prev, [fieldKey]: url }))
        handleChange(fieldKey, url)
        showToast('success', type === 'logo' ? 'Logo updated!' : 'Favicon updated!')
      }
    } catch (e: any) {
      showToast('error', e?.response?.data?.message || e?.message || 'Upload failed')
    } finally {
      setUploading(null)
    }
  }

  const GROUP_ORDER = ['ai', 'payment', 'email', 'security', 'auth', 'general', 'branding']

  /* Stats */
  const stats = useMemo(() => {
    if (!data) return { total: 0, configured: 0, fromDb: 0, fromEnv: 0 }
    const vals = Object.values(data.settings)
    return {
      total: vals.length,
      configured: vals.filter((s) => s.hasValue).length,
      fromDb: vals.filter((s) => s.source === 'db').length,
      fromEnv: vals.filter((s) => s.source === 'env').length,
    }
  }, [data])

  /* ── Render ── */
  if (loading) {
    return (
      <div className="settings-loading">
        <div className="settings-loading-spinner">
          <i className="fa-solid fa-gear fa-spin" />
        </div>
        <span>Loading settings…</span>
      </div>
    )
  }
  if (error) return <div className="admin-error">{error}</div>
  if (!data) return null

  const totalDirty = Object.keys(drafts).filter((k) => isDirty(k)).length

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className={`admin-toast admin-toast-${toast.kind}`}>
          <i className={`fa-solid ${toast.kind === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`} />
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="settings-page-header">
        <div className="settings-header-left">
          <h2 className="admin-page-title">
            <i className="fa-solid fa-gear" />
            Settings
          </h2>
          <p className="settings-subtitle">Manage your application configuration</p>
        </div>
        <div className="settings-header-actions">
          {totalDirty > 0 && (
            <span className="settings-dirty-badge">
              <i className="fa-solid fa-circle" />
              {totalDirty} unsaved change{totalDirty > 1 ? 's' : ''}
            </span>
          )}
          <button
            type="button"
            className="admin-btn admin-btn-primary settings-save-all-btn"
            disabled={saving || totalDirty === 0}
            onClick={saveAll}
          >
            {saving ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" />
                Saving…
              </>
            ) : (
              <>
                <i className="fa-solid fa-floppy-disk" />
                Save all{totalDirty > 0 ? ` (${totalDirty})` : ''}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="settings-stats">
        <div className="settings-stat">
          <span className="settings-stat-value">{stats.total}</span>
          <span className="settings-stat-label">Total</span>
        </div>
        <div className="settings-stat">
          <span className="settings-stat-value stat-ok">{stats.configured}</span>
          <span className="settings-stat-label">Configured</span>
        </div>
        <div className="settings-stat">
          <span className="settings-stat-value stat-db">{stats.fromDb}</span>
          <span className="settings-stat-label">From DB</span>
        </div>
        <div className="settings-stat">
          <span className="settings-stat-value stat-env">{stats.fromEnv}</span>
          <span className="settings-stat-label">From Env</span>
        </div>
      </div>

      {/* Settings groups */}
      <div className="settings-groups">
        {GROUP_ORDER.filter((gk) => data.groups[gk]).map((groupKey) => {
          const group = data.groups[groupKey]
          const config = GROUP_CONFIG[groupKey] ?? { icon: 'fa-cube', color: 'oklch(0.6 0.04 60)', description: '' }
          const dirty = hasDirtyInGroup(groupKey)
          const dirtyCount = dirtyCountInGroup(groupKey)
          const isCollapsed = collapsed.has(groupKey)

          return (
            <div
              key={groupKey}
              className={`settings-group-card${dirty ? ' has-dirty' : ''}`}
              style={{ '--group-accent': config.color } as React.CSSProperties}
            >
              {/* Card header */}
              <div className="settings-group-header" onClick={() => toggleCollapse(groupKey)}>
                <div className="settings-group-header-left">
                  <div className="settings-group-icon">
                    <i className={`fa-solid ${config.icon}`} />
                  </div>
                  <div className="settings-group-title-wrap">
                    <h3 className="settings-group-title">{group.label}</h3>
                    {config.description && (
                      <span className="settings-group-desc">{config.description}</span>
                    )}
                  </div>
                </div>
                <div className="settings-group-header-right">
                  {dirtyCount > 0 && (
                    <span className="settings-group-dirty-pill">
                      {dirtyCount} modified
                    </span>
                  )}
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm settings-group-save-btn"
                    disabled={savingGroup === groupKey || !dirty}
                    onClick={(e) => { e.stopPropagation(); saveGroup(groupKey) }}
                  >
                    {savingGroup === groupKey ? (
                      <><i className="fa-solid fa-spinner fa-spin" /> Saving…</>
                    ) : (
                      <><i className="fa-solid fa-check" /> Save</>
                    )}
                  </button>
                  <button
                    type="button"
                    className="settings-collapse-btn"
                    onClick={(e) => { e.stopPropagation(); toggleCollapse(groupKey) }}
                    aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                  >
                    <i className={`fa-solid fa-chevron-${isCollapsed ? 'down' : 'up'}`} />
                  </button>
                </div>
              </div>

              {/* Card body */}
              {!isCollapsed && (
                <div className="settings-group-body">
                  {group.fields.map((fieldKey) => {
                    const meta = data.settings[fieldKey]
                    if (!meta) return null
                    const val = getDisplayValue(fieldKey, meta)
                    const fieldVisible = visible.has(fieldKey)
                    const dirtyField = isDirty(fieldKey)
                    const boolField = isBooleanField(fieldKey, meta)
                    const description = FIELD_DESCRIPTIONS[fieldKey]

                    return (
                      <div
                        key={fieldKey}
                        className={`settings-field${dirtyField ? ' dirty' : ''}${boolField ? ' boolean-field' : ''}`}
                      >
                        {/* Field label row */}
                        <div className="settings-field-header">
                          <div className="settings-field-label-group">
                            <label className="settings-field-label" htmlFor={`setting-${fieldKey}`}>
                              {meta.label || fieldKey}
                            </label>
                            <span className={`settings-source-badge source-${meta.source}`}>
                              {meta.source === 'db' ? (
                                <><i className="fa-solid fa-database" /> DB</>
                              ) : (
                                <><i className="fa-solid fa-terminal" /> ENV</>
                              )}
                            </span>
                          </div>
                          <div className="settings-field-status">
                            {dirtyField ? (
                              <span className="settings-status-modified">
                                <i className="fa-solid fa-pen" /> Modified
                              </span>
                            ) : meta.hasValue ? (
                              <span className="settings-status-saved">
                                <i className="fa-solid fa-check" /> Saved
                              </span>
                            ) : (
                              <span className="settings-status-empty">
                                <i className="fa-solid fa-minus" /> Not set
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Description */}
                        {description && (
                          <p className="settings-field-description">{description}</p>
                        )}

                        {/* Input area */}
                        {fieldKey === 'site_logo_url' || fieldKey === 'site_favicon_url' ? (
                          <div className="settings-branding-upload">
                            {(uploadPreview[fieldKey] || val) ? (
                              <div className="branding-preview">
                                <img
                                  src={uploadPreview[fieldKey] || val}
                                  alt={fieldKey === 'site_logo_url' ? 'Logo' : 'Favicon'}
                                  className={fieldKey === 'site_logo_url' ? 'branding-preview-logo' : 'branding-preview-favicon'}
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                />
                              </div>
                            ) : (
                              <div className="branding-preview branding-preview-empty">
                                <i className={`fa-solid ${fieldKey === 'site_logo_url' ? 'fa-image' : 'fa-star'}`} />
                                <span>No {fieldKey === 'site_logo_url' ? 'logo' : 'favicon'} uploaded</span>
                              </div>
                            )}
                            <label className="branding-upload-btn">
                              <i className={`fa-solid ${uploading === fieldKey ? 'fa-spinner fa-spin' : 'fa-upload'}`} />
                              {uploading === fieldKey ? ' Uploading…' : ` Upload ${fieldKey === 'site_logo_url' ? 'Logo' : 'Favicon'}`}
                              <input
                                type="file"
                                accept={fieldKey === 'site_favicon_url' ? '.ico,.png,.jpg' : '.png,.jpg,.svg'}
                                hidden
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) handleUpload(fieldKey, file)
                                }}
                              />
                            </label>
                            {val && (
                              <input
                                className="settings-input branding-url-input"
                                value={val}
                                placeholder="https://…"
                                onChange={(e) => handleChange(fieldKey, e.target.value)}
                                autoComplete="off"
                                spellCheck={false}
                              />
                            )}
                          </div>
                        ) : boolField ? (
                          <div className="settings-bool-row">
                            <ToggleSwitch
                              checked={val.toLowerCase() === 'true'}
                              onChange={(v) => handleChange(fieldKey, v)}
                            />
                            <span className="settings-bool-label">
                              {val.toLowerCase() === 'true' ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                        ) : (
                          <div className="settings-input-wrap">
                            <input
                              id={`setting-${fieldKey}`}
                              type={fieldVisible ? 'text' : 'password'}
                              className="settings-input"
                              value={val}
                              placeholder={meta.hasValue ? meta.value : 'Not set — enter value…'}
                              onChange={(e) => handleChange(fieldKey, e.target.value)}
                              autoComplete="off"
                              spellCheck={false}
                            />
                            <button
                              type="button"
                              className="settings-eye-btn"
                              onClick={() => toggleVisible(fieldKey)}
                              title={fieldVisible ? 'Hide value' : 'Show value'}
                              aria-label={fieldVisible ? 'Hide value' : 'Show value'}
                            >
                              <i className={`fa-solid ${fieldVisible ? 'fa-eye-slash' : 'fa-eye'}`} />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
