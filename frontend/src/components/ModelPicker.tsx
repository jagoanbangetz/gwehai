import React, { useState, useRef, useEffect, useMemo } from 'react'
import apiClient from '../utils/api'
import './ModelPicker.css'

/* ─── Model Keys ─── */
export type ModelKey =
  | 'auto'
  | 'openai_gpt55' | 'openai_gpt5' | 'openai_gpt4o' | 'openai_o3' | 'openai_o4mini' | 'openai_codex'
  | 'claude_fable5' | 'claude_opus48' | 'claude_sonnet4' | 'claude_haiku4'
  | 'gemini_31_pro' | 'gemini_3_flash' | 'gemini_25_pro' | 'gemini_ultra'
  | 'deepseek_v4' | 'deepseek_v4_flash' | 'deepseek_r1' | 'deepseek_chat' | 'deepseek_coder'

/* ─── Provider Groups ─── */
interface ModelOption {
  key: ModelKey
  label: string
}

interface ProviderGroup {
  provider: string
  icon: string
  models: ModelOption[]
}

const PROVIDER_GROUPS: ProviderGroup[] = [
  {
    provider: 'OpenAI',
    icon: 'fa-solid fa-bolt',
    models: [
      { key: 'openai_gpt55',   label: 'GPT-5.5' },
      { key: 'openai_gpt5',    label: 'GPT-5' },
      { key: 'openai_gpt4o',   label: 'GPT-4o' },
      { key: 'openai_o3',      label: 'o3' },
      { key: 'openai_o4mini',  label: 'o4-mini' },
      { key: 'openai_codex',   label: 'Codex' },
    ],
  },
  {
    provider: 'Anthropic',
    icon: 'fa-solid fa-shield-halved',
    models: [
      { key: 'claude_fable5',  label: 'Claude Fable 5' },
      { key: 'claude_opus48',  label: 'Claude Opus 4.8' },
      { key: 'claude_sonnet4', label: 'Claude Sonnet 4' },
      { key: 'claude_haiku4',  label: 'Claude Haiku 4' },
    ],
  },
  {
    provider: 'Google AI',
    icon: 'fa-solid fa-star',
    models: [
      { key: 'gemini_31_pro',  label: 'Gemini 3.1 Pro' },
      { key: 'gemini_3_flash', label: 'Gemini 3 Flash' },
      { key: 'gemini_25_pro',  label: 'Gemini 2.5 Pro' },
      { key: 'gemini_ultra',   label: 'Gemini Ultra' },
    ],
  },
  {
    provider: 'DeepSeek',
    icon: 'fa-solid fa-water',
    models: [
      { key: 'deepseek_v4',       label: 'V4' },
      { key: 'deepseek_v4_flash', label: 'V4 Flash' },
      { key: 'deepseek_r1',       label: 'R1' },
      { key: 'deepseek_chat',     label: 'Chat' },
      { key: 'deepseek_coder',    label: 'Coder' },
    ],
  },
]

/* ─── Flat option list (for lookups) ─── */
const ALL_MODEL_OPTIONS: { key: ModelKey; label: string; provider: string; icon: string }[] = [
  { key: 'auto', label: 'Auto', provider: 'Auto', icon: 'fa-solid fa-shuffle' },
  ...PROVIDER_GROUPS.flatMap(g => g.models.map(m => ({ ...m, provider: g.provider, icon: g.icon }))),
]

const MODEL_KEY_ORDER: ModelKey[] = ALL_MODEL_OPTIONS.map(o => o.key)

const STORAGE_KEY = 'gwehai_model_key'
const STORAGE_MODEL_ID_KEY = 'gwehai_model_id'

/* ─── Helpers ─── */
export function getStoredModelKey(): ModelKey {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && MODEL_KEY_ORDER.includes(raw as ModelKey)) return raw as ModelKey
  } catch (_) {}
  return 'deepseek_v4'
}

export function getStoredModelId(): string | null {
  try { return localStorage.getItem(STORAGE_MODEL_ID_KEY) } catch (_) {}
  return null
}

export function setStoredModelKey(key: ModelKey): void {
  try { localStorage.setItem(STORAGE_KEY, key) } catch (_) {}
}

export function getModelLabel(key: string): string {
  const found = ALL_MODEL_OPTIONS.find(o => o.key === key)
  if (found) return found.label
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/* ─── Backend Row ─── */
interface BackendModelRow {
  id: string
  name: string
  displayName: string
  provider: string
  isActive: boolean
  metadata?: Record<string, any>
}

function getModelKeyForRow(row: BackendModelRow): ModelKey | null {
  const metaKey = row.metadata?.key as string | undefined
  if (metaKey && MODEL_KEY_ORDER.includes(metaKey as ModelKey)) return metaKey as ModelKey
  const name = (row.name || '').toLowerCase()
  if (name.includes('gpt-5.5') || name.includes('gpt55')) return 'openai_gpt55'
  if (name.includes('gpt-5') || name.includes('gpt5') && !name.includes('gpt-5.5')) return 'openai_gpt5'
  if (name.includes('gpt-4o')) return 'openai_gpt4o'
  if (name.includes('o3')) return 'openai_o3'
  if (name.includes('o4-mini') || name.includes('o4mini')) return 'openai_o4mini'
  if (name.includes('codex')) return 'openai_codex'
  if (name.includes('fable')) return 'claude_fable5'
  if (name.includes('opus')) return 'claude_opus48'
  if (name.includes('sonnet')) return 'claude_sonnet4'
  if (name.includes('haiku')) return 'claude_haiku4'
  if (name.includes('gemini-3.1') || name.includes('gemini31')) return 'gemini_31_pro'
  if (name.includes('gemini-3') || (name.includes('gemini') && name.includes('flash'))) return 'gemini_3_flash'
  if (name.includes('gemini-2.5') || name.includes('gemini25')) return 'gemini_25_pro'
  if (name.includes('gemini-ultra')) return 'gemini_ultra'
  if (name.includes('deepseek') && name.includes('flash')) return 'deepseek_v4_flash'
  if (name.includes('deepseek') && (name.includes('v4') || name.includes('chat'))) return 'deepseek_v4'
  if (name.includes('reasoner') || (name.includes('deepseek') && name.includes('r1'))) return 'deepseek_r1'
  if (name.includes('coder')) return 'deepseek_coder'
  return null
}

function isSupportedModel(row: BackendModelRow): boolean {
  return getModelKeyForRow(row) !== null
}

/* ─── Props ─── */
export interface ModelPickerProps {
  value: ModelKey
  onChange: (key: ModelKey, modelId?: string) => void
  disabled?: boolean
  className?: string
  planId?: string | null
}

/* ─── Component ─── */
const ModelPicker: React.FC<ModelPickerProps> = ({ value, onChange, disabled, className, planId }) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [models, setModels] = useState<BackendModelRow[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const currentModel = models.find(m => m.id === selectedModelId) || null
  const fallbackLabel = getModelLabel(value)
  const currentLabel = currentModel ? (currentModel.displayName || currentModel.name || fallbackLabel) : fallbackLabel
  const isFreePlan = (planId ?? '').toUpperCase() === 'FREE'

  const currentOption = ALL_MODEL_OPTIONS.find(o => o.key === value)

  const searchLower = search.trim().toLowerCase()

  // Load from backend
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiClient.get<BackendModelRow[]>('/chat/models')
        if (cancelled) return
        const list = (Array.isArray(res.data) ? res.data : []).filter(m => m && m.isActive)
        if (list.length === 0) {
          const synthetic: BackendModelRow[] = ALL_MODEL_OPTIONS.map(o => ({
            id: o.key,
            name: o.label,
            displayName: o.label,
            provider: o.provider,
            isActive: true,
            metadata: { key: o.key },
          }))
          setModels(synthetic)
          const initial = synthetic.find(m => getModelKeyForRow(m) === value) || synthetic[0] || null
          if (initial && !cancelled) setSelectedModelId(initial.id)
          return
        }
        setModels(list)
        let storedId: string | null = null
        try { storedId = localStorage.getItem(STORAGE_MODEL_ID_KEY) } catch (_) {}
        const byStored = storedId ? list.find(m => m.id === storedId) : undefined
        const byKey = list.find(m => getModelKeyForRow(m) === value)
        const byDefault = list.find(m => (m as any).isDefault)
        const fallback = list.find(isSupportedModel) || null
        const initial = byStored || byKey || byDefault || fallback || null
        if (initial) setSelectedModelId(initial.id)
      } catch {
        const synthetic: BackendModelRow[] = ALL_MODEL_OPTIONS.map(o => ({
          id: o.key,
          name: o.label,
          displayName: o.label,
          provider: o.provider,
          isActive: true,
          metadata: { key: o.key },
        }))
        setModels(synthetic)
        const initial = synthetic.find(m => getModelKeyForRow(m) === value) || synthetic[0] || null
        if (initial && !cancelled) setSelectedModelId(initial.id)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!open) return
    setSearch('')
    searchInputRef.current?.focus()
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  const selectModel = (m: BackendModelRow) => {
    const key = getModelKeyForRow(m)
    if (!key) return
    const locked = isFreePlan && key !== 'auto'
    if (locked || disabled) return
    setSelectedModelId(m.id)
    onChange(key, m.id)
    setStoredModelKey(key)
    try { localStorage.setItem(STORAGE_MODEL_ID_KEY, m.id) } catch (_) {}
    setOpen(false)
  }

  // Build options for rendering: either API-backed groups or synthetic fallback groups
  const renderGroups = useMemo(() => {
    // With search active, use flat filtered list
    if (searchLower) {
      const filtered = ALL_MODEL_OPTIONS.filter(o =>
        o.label.toLowerCase().includes(searchLower) ||
        o.provider.toLowerCase().includes(searchLower) ||
        o.key.toLowerCase().includes(searchLower)
      )
      return [{ provider: 'Results', icon: '', models: filtered.map(o => ({ ...o, id: o.key, _row: null as any })) }]
    }

    // Build grouped from API models or fallback to ALL_MODEL_OPTIONS
    const apiRows = models.filter(isSupportedModel)
    if (apiRows.length > 0) {
      return PROVIDER_GROUPS.map(g => {
        const groupModels = g.models
          .map(m => {
            const row = apiRows.find(r => getModelKeyForRow(r) === m.key)
            return row ? { ...m, id: row.id, _row: row } : null
          })
          .filter(Boolean) as (ModelOption & { id: string; _row: BackendModelRow })[]
        return groupModels.length > 0 ? { provider: g.provider, icon: g.icon, models: groupModels } : null
      }).filter(Boolean) as { provider: string; icon: string; models: (ModelOption & { id: string; _row: BackendModelRow })[] }[]
    }

    // Fallback: synthetic from ALL_MODEL_OPTIONS
    return PROVIDER_GROUPS.map(g => ({
      provider: g.provider,
      icon: g.icon,
      models: g.models.map(m => ({ ...m, id: m.key, _row: null as any })),
    }))
  }, [models, searchLower])

  return (
    <div className={`model-picker ${className ?? ''} ${open ? 'open' : ''}`} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="model-picker-trigger"
        onClick={() => !disabled && setOpen(prev => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Model: ${currentLabel}`}
      >
        <i className={`model-picker-trigger-icon ${currentOption?.icon || 'fa-solid fa-microchip'}`} aria-hidden />
        <span className="model-picker-label">{currentLabel}</span>
        <span className="model-picker-chevron" aria-hidden>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      {open && (
        <div
          className="model-picker-dropdown"
          role="listbox"
          style={{ minWidth: triggerRef.current ? Math.max(triggerRef.current.offsetWidth, 380) : undefined }}
        >
          <div className="model-picker-search-wrap">
            <i className="model-picker-search-icon fa-solid fa-magnifying-glass" aria-hidden />
            <input
              ref={searchInputRef}
              type="text"
              className="model-picker-search-input"
              placeholder="Search models..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              aria-label="Filter models"
            />
          </div>
          <div className="model-picker-options-wrap">
            {renderGroups.length === 0 ? (
              <div className="model-picker-empty">No models available</div>
            ) : (
              renderGroups.map(group => (
                <div key={group.provider} className="model-picker-group">
                  {!searchLower && (
                    <div className="model-picker-group-header">
                      {group.icon && <i className={group.icon} aria-hidden />}
                      <span>{group.provider}</span>
                    </div>
                  )}
                  {group.models.map(m => {
                    const locked = isFreePlan && m.key !== 'auto'
                    const selected = selectedModelId === m.id
                    const row = (m as any)._row as BackendModelRow | null
                    const opt = ALL_MODEL_OPTIONS.find(o => o.key === m.key)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        aria-disabled={locked}
                        className={`model-picker-option ${selected ? 'selected' : ''} ${locked ? 'locked' : ''}`}
                        onClick={() => row ? selectModel(row) : null}
                      >
                        <i className={`model-picker-option-icon ${opt?.icon || 'fa-solid fa-microchip'}`} aria-hidden />
                        <span className="model-picker-option-label">{m.label}</span>
                        {locked && <span className="model-picker-option-tag">Pro</span>}
                        {selected && <i className="model-picker-option-check fa-solid fa-check" aria-hidden />}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ModelPicker
