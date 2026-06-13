import React, { useState, useRef, useEffect, useMemo } from 'react'
import apiClient from '../utils/api'
import './ModelPicker.css'

export type ModelKey = 'auto' | 'deepseek_v4' | 'deepseek_v4_pro' | 'openai_gpt5' | 'openai_o' | 'claude' | 'gemini' | 'xai' | 'meta'

/** Auto uses DeepSeek V4 Pro under the hood. */
export const MODEL_OPTIONS: { key: ModelKey; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'claude', label: 'Claude' },
  { key: 'deepseek_v4', label: 'DeepSeek V4' },
  { key: 'deepseek_v4_pro', label: 'DeepSeek V4 Pro' },
  { key: 'gemini', label: 'Gemini' },
  { key: 'meta', label: 'Llama' },
  { key: 'openai_gpt5', label: 'OpenAI GPT-5' },
  { key: 'openai_o', label: 'OpenAI o4-mini' },
  { key: 'xai', label: 'Grok' },
]

const STORAGE_KEY = 'gwehai_model_key'
const STORAGE_MODEL_ID_KEY = 'gwehai_model_id'

/** Flat model key list for ordering (Auto first, rest alphabetical). */
const MODEL_KEY_ORDER: ModelKey[] = MODEL_OPTIONS.map(o => o.key)

/** Small FA icon per model (optional, subtle). */
const MODEL_ICON: Record<ModelKey, string> = {
  auto: 'fa-solid fa-shuffle',
  deepseek_v4: 'fa-solid fa-water',
  deepseek_v4_pro: 'fa-solid fa-water',
  openai_gpt5: 'fa-solid fa-bolt',
  openai_o: 'fa-solid fa-bolt',
  claude: 'fa-solid fa-shield-halved',
  gemini: 'fa-solid fa-star',
  xai: 'fa-solid fa-x',
  meta: 'fa-solid fa-paw',
}

export function getStoredModelKey(): ModelKey {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'deepseek' || raw === 'auto') return 'auto'
    // Migrate removed keys
    if (raw === 'deepseek_reasoner' || raw === 'deepseek_v3') return 'auto'
    if (raw && MODEL_OPTIONS.some(o => o.key === raw)) return raw as ModelKey
  } catch (_) {}
  return 'auto'
}

export function getStoredModelId(): string | null {
  try {
    return localStorage.getItem(STORAGE_MODEL_ID_KEY)
  } catch (_) {}
  return null
}

export function setStoredModelKey(key: ModelKey): void {
  try {
    localStorage.setItem(STORAGE_KEY, key)
  } catch (_) {}
}

export function getModelLabel(key: string): string {
  const found = MODEL_OPTIONS.find(o => o.key === key)
  if (found) return found.label
  // Fallback for removed/unknown keys: prettify the key
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

interface BackendModelRow {
  id: string
  name: string
  displayName: string
  provider: string
  isActive: boolean
  metadata?: Record<string, any>
}

function getModelKeyForRow(row: BackendModelRow): ModelKey | null {
  // Use metadata.key from DB — seeded by model-options.config
  const metaKey = row.metadata?.key as string | undefined
  if (metaKey && isValidModelKey(metaKey)) return metaKey
  // Fallback: guess by provider
  const provider = (row.provider || '').toLowerCase()
  if (provider === 'anthropic') return 'claude'
  if (provider === 'openai') return 'openai_gpt5'
  if (provider === 'gemini' || provider === 'google') return 'gemini'
  if (provider === 'xai') return 'xai'
  if (provider === 'meta') return 'meta'
  return null
}

function isValidModelKey(k: string): k is ModelKey {
  return MODEL_KEY_ORDER.includes(k as ModelKey)
}

/** Filter out unsupported models (R1/V3 etc.) */
function isSupportedModel(row: BackendModelRow): boolean {
  const key = getModelKeyForRow(row)
  return key !== null && MODEL_KEY_ORDER.includes(key)
}

export interface ModelPickerProps {
  value: ModelKey
  /** Called when user picks a model. Second arg is the DB model id (UUID) when a specific model row is selected. */
  onChange: (key: ModelKey, modelId?: string) => void
  disabled?: boolean
  className?: string
  planId?: string | null
}

/**
 * Flat model picker dropdown — simple, clean, monochrome.
 * Auto on top, then alphabetical. No grouped provider sections.
 * Persists to localStorage; parent should sync to backend user preference if available.
 */
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

  const searchLower = search.trim().toLowerCase()
  const filteredModels = useMemo(() => {
    // Filter: only supported models, then by search
    const supported = models.filter(isSupportedModel)
    if (!searchLower) return supported
    return supported.filter(
      m =>
        (m.displayName || m.name || '').toLowerCase().includes(searchLower) ||
        (m.name || '').toLowerCase().includes(searchLower),
    )
  }, [models, searchLower])

  // Sort: Auto first, then alphabetical by display name
  const sortedModels = useMemo(() => {
    return [...filteredModels].sort((a, b) => {
      const aKey = getModelKeyForRow(a) || 'auto'
      const bKey = getModelKeyForRow(b) || 'auto'
      const aIdx = MODEL_KEY_ORDER.indexOf(aKey)
      const bIdx = MODEL_KEY_ORDER.indexOf(bKey)
      return aIdx - bIdx
    })
  }, [filteredModels])

  // Load models from backend so the picker mirrors Admin → Models.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiClient.get<BackendModelRow[]>('/chat/models')
        if (cancelled) return
        const list = (Array.isArray(res.data) ? res.data : []).filter(m => m && m.isActive)
        setModels(list)

        let storedId: string | null = null
        try {
          storedId = localStorage.getItem(STORAGE_MODEL_ID_KEY)
        } catch (_) {}

        const byStored = storedId ? list.find(m => m.id === storedId) : undefined
        const byKey = list.find(m => getModelKeyForRow(m) === value)
        const byDefault = list.find(m => (m as any).isDefault)
        const fallback = list.find(isSupportedModel) || null
        const initial = byStored || byKey || byDefault || fallback || null
        if (initial) {
          setSelectedModelId(initial.id)
        }
      } catch {
        // Ignore errors and fall back to built-in MODEL_OPTIONS.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setSearch('')
    searchInputRef.current?.focus()
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
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
    try {
      localStorage.setItem(STORAGE_MODEL_ID_KEY, m.id)
    } catch (_) {}
    setOpen(false)
  }

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
        <i className={`model-picker-trigger-icon ${MODEL_ICON[value] || 'fa-solid fa-microchip'}`} aria-hidden />
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
          style={{ minWidth: triggerRef.current ? triggerRef.current.offsetWidth : undefined }}
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
            {sortedModels.length === 0 ? (
              <div className="model-picker-empty">
                {models.length === 0
                  ? 'No models available'
                  : `No models match "${search}"`}
              </div>
            ) : (
              sortedModels.map(m => {
                const key = getModelKeyForRow(m) || 'auto'
                const locked = isFreePlan && key !== 'auto'
                const selected = selectedModelId === m.id
                const icon = MODEL_ICON[key] || 'fa-solid fa-microchip'
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-disabled={locked}
                    className={`model-picker-option ${selected ? 'selected' : ''} ${locked ? 'locked' : ''}`}
                    onClick={() => selectModel(m)}
                  >
                    <i className={`model-picker-option-icon ${icon}`} aria-hidden />
                    <span className="model-picker-option-label">{m.displayName || m.name}</span>
                    {locked && <span className="model-picker-option-tag">Pro</span>}
                    {selected && <i className="model-picker-option-check fa-solid fa-check" aria-hidden />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ModelPicker
