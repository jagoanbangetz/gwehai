import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
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
  ai:       { icon: 'fa-brain',           color: '#8c8c8c',  description: 'AI model keys & inference settings' },
  payment:  { icon: 'fa-credit-card',     color: '#8c8c8c',  description: 'Payment gateway & billing config' },
  email:    { icon: 'fa-envelope',        color: '#999999',   description: 'SMTP & email delivery settings' },
  security: { icon: 'fa-shield-halved',   color: '#8c8c8c',   description: 'Encryption, secrets & access control' },
  auth:     { icon: 'fa-key',             color: '#999999',    description: 'Authentication & OAuth providers' },
  general:  { icon: 'fa-sliders',         color: '#999999',    description: 'General application settings' },
  branding: { icon: 'fa-palette',         color: '#a5a5a5',  description: 'Logo, favicon & visual identity' },
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
  site_logo_url:            'Brand logo displayed in the app header and reports.',
  site_favicon_url:         'Browser tab icon (favicon). ICO, PNG, or SVG.',
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

/* ── Branding Upload Field ── */
function BrandingUploadField({
  type,
  label,
  description,
  currentUrl,
  onUploaded,
  showToast,
}: {
  type: 'logo' | 'favicon'
  label: string
  description?: string
  currentUrl: string
  onUploaded: (url: string) => void
  showToast: (kind: 'success' | 'error', msg: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(currentUrl || null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    setPreview(currentUrl || null)
  }, [currentUrl])

  const ACCEPT = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']
  const MAX_SIZE = 2 * 1024 * 1024

  const handleFile = async (file: File) => {
    if (!ACCEPT.includes(file.type) && !file.name.match(/\.(png|jpe?g|svg|ico)$/i)) {
      showToast('error', 'Invalid format. Allowed: PNG, JPG, SVG, ICO')
      return
    }
    if (file.size > MAX_SIZE) {
      showToast('error', `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: 2MB`)
      return
    }

    // Preview
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result as string)
    reader.readAsDataURL(file)

    // Upload
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('type', type)
      const res = await apiClient.post('/admin/settings/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const url = res.data?.url
      onUploaded(url)
      showToast('success', `${type === 'logo' ? 'Logo' : 'Favicon'} updated`)

      // Update favicon in <head>
      if (type === 'favicon' && url) {
        let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null
        if (!link) {
          link = document.createElement('link')
          link.rel = 'icon'
          document.head.appendChild(link)
        }
        link.href = url
      }
    } catch (e: any) {
      showToast('error', e?.response?.data?.message || e?.message || 'Upload failed')
      setPreview(currentUrl || null)
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="branding-upload-field">
      <div className="branding-field-header">
        <span className="branding-field-label">{label}</span>
        {description && <span className="branding-field-desc">{description}</span>}
      </div>

      <div
        className={`branding-dropzone ${dragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".png,.jpg,.jpeg,.svg,.ico,image/png,image/jpeg,image/svg+xml,image/x-icon"
          onChange={onInputChange}
          hidden
        />

        {uploading ? (
          <div className="branding-dropzone-loading">
            <i className="fa-solid fa-spinner fa-spin" />
            <span>Uploading…</span>
          </div>
        ) : preview ? (
          <div className="branding-preview-wrap">
            <img src={preview} alt={label} className="branding-preview-img" />
            <div className="branding-preview-overlay">
              <i className="fa-solid fa-cloud-arrow-up" />
              <span>Click or drop to replace</span>
            </div>
          </div>
        ) : (
          <div className="branding-dropzone-empty">
            <i className="fa-solid fa-cloud-arrow-up" />
            <span>Click or drag &amp; drop</span>
            <span className="branding-dropzone-hint">PNG, JPG, SVG, ICO — max 2MB</span>
          </div>
        )}
      </div>

      {preview && (
        <button
          type="button"
          className="branding-remove-btn"
          onClick={(e) => {
            e.stopPropagation()
            setPreview(null)
            onUploaded('')
            showToast('success', `${type === 'logo' ? 'Logo' : 'Favicon'} removed`)
            if (type === 'favicon') {
              const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null
              if (link) link.href = '/favicon.ico'
            }
          }}
        >
          <i className="fa-solid fa-trash" /> Remove
        </button>
      )}
    </div>
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
          const config = GROUP_CONFIG[groupKey] ?? { icon: 'fa-cube', color: '#999999', description: '' }
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
                  {groupKey === 'branding' ? (
                    <div className="branding-grid">
                      <BrandingUploadField
                        type="logo"
                        label="Site Logo"
                        description="Displayed in the app header and reports"
                        currentUrl={data.settings['site_logo_url']?.value || ''}
                        onUploaded={(url) => {
                          setData((prev) => {
                            if (!prev) return prev
                            return {
                              ...prev,
                              settings: {
                                ...prev.settings,
                                site_logo_url: { ...prev.settings['site_logo_url'], value: url, hasValue: !!url, source: 'db' },
                              },
                            }
                          })
                        }}
                        showToast={showToast}
                      />
                      <BrandingUploadField
                        type="favicon"
                        label="Favicon"
                        description="Browser tab icon (ICO, PNG, or SVG)"
                        currentUrl={data.settings['site_favicon_url']?.value || ''}
                        onUploaded={(url) => {
                          setData((prev) => {
                            if (!prev) return prev
                            return {
                              ...prev,
                              settings: {
                                ...prev.settings,
                                site_favicon_url: { ...prev.settings['site_favicon_url'], value: url, hasValue: !!url, source: 'db' },
                              },
                            }
                          })
                        }}
                        showToast={showToast}
                      />
                    </div>
                  ) : (
                    <>
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
                            {boolField ? (
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
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
