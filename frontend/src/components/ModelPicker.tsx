import React, { useState, useRef, useEffect, useMemo } from 'react'
import apiClient from '../utils/api'
import './ModelPicker.css'

export type ModelKey = 'auto' | 'openai_gpt5' | 'claude' | 'gemini'

/** Auto uses DeepSeek under the hood; DeepSeek is not shown as a separate option. */
export const MODEL_OPTIONS: { key: ModelKey; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'openai_gpt5', label: 'OpenAI GPT5' },
  { key: 'claude', label: 'Claude' },
  { key: 'gemini', label: 'Gemini' },
]

const STORAGE_KEY = 'gwehai_model_key'
const STORAGE_MODEL_ID_KEY = 'gwehai_model_id'

const GROUP_ORDER: ModelKey[] = ['auto', 'openai_gpt5', 'claude', 'gemini']
const GROUP_LABELS: Record<ModelKey, string> = {
  auto: 'Auto',
  openai_gpt5: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
}

export function getStoredModelKey(): ModelKey {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'deepseek' || raw === 'auto') return 'auto'
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

export function getModelLabel(key: ModelKey): string {
  return MODEL_OPTIONS.find(o => o.key === key)?.label ?? key
}

interface BackendModelRow {
  id: string
  name: string
  displayName: string
  provider: string
  isActive: boolean
}

function getModelKeyForRow(row: BackendModelRow): ModelKey {
  const name = (row.name || '').toLowerCase()
  const provider = (row.provider || '').toLowerCase()
  if (name.includes('deepseek')) return 'auto'
  if (provider === 'anthropic') return 'claude'
  if (provider === 'openai') return 'openai_gpt5'
  if (provider === 'google') return name.includes('gemini') ? 'gemini' : 'openai_gpt5'
  if (provider === 'gemini') return 'gemini'
  if (provider === 'custom') return name.includes('grok') ? 'openai_gpt5' : name.includes('gemini') ? 'gemini' : 'auto'
  return 'auto'
}

/** Group models by provider key for Select2-style sections. */
function groupModelsByKey(models: BackendModelRow[]): { key: ModelKey; label: string; models: BackendModelRow[] }[] {
  const map = new Map<ModelKey, BackendModelRow[]>()
  for (const k of GROUP_ORDER) {
    map.set(k, [])
  }
  for (const m of models) {
    const k = getModelKeyForRow(m)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(m)
  }
  return GROUP_ORDER.map(key => ({
    key,
    label: GROUP_LABELS[key],
    models: map.get(key) || [],
  })).filter(g => g.models.length > 0)
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
 * Compact pill/dropdown for model selection (Auto, OpenAI GPT5, Claude). Auto uses DeepSeek.
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
    if (!searchLower) return models
    return models.filter(
      m =>
        (m.displayName || m.name || '').toLowerCase().includes(searchLower) ||
        (m.name || '').toLowerCase().includes(searchLower),
    )
  }, [models, searchLower])
  const grouped = useMemo(() => groupModelsByKey(filteredModels), [filteredModels])
  const hasResults = grouped.some(g => g.models.length > 0)

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
        const fallback = list[0]
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
        <span className="model-picker-icon" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
          </svg>
        </span>
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
            <span className="model-picker-search-icon" aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </span>
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
            {!hasResults ? (
              <div className="model-picker-empty">
                {models.length === 0
                  ? 'No models available'
                  : `No models match "${search}"`}
              </div>
            ) : (
              grouped.map(({ key: groupKey, label: groupLabel, models: groupModels }) => (
                <div key={groupKey} className="model-picker-group">
                  <div className="model-picker-group-label">{groupLabel}</div>
                  {groupModels.map(m => {
                    const key = getModelKeyForRow(m)
                    const locked = isFreePlan && key !== 'auto'
                    const selected = selectedModelId === m.id
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
                        <span className="model-picker-option-label">{m.displayName || m.name}</span>
                        {locked && <span className="model-picker-option-tag">Pro</span>}
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
