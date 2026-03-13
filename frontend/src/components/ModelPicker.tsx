import React, { useState, useRef, useEffect } from 'react'
import apiClient from '../utils/api'
import './ModelPicker.css'

export type ModelKey = 'auto' | 'deepseek' | 'openai_gpt5' | 'claude' | 'gemini'

/** Auto uses DeepSeek under the hood; DeepSeek is not shown as a separate option. */
export const MODEL_OPTIONS: { key: ModelKey; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'openai_gpt5', label: 'OpenAI GPT5' },
  { key: 'claude', label: 'Claude' },
  { key: 'gemini', label: 'Gemini' },
]

const STORAGE_KEY = 'gwehai_model_key'
const STORAGE_MODEL_ID_KEY = 'gwehai_model_id'

export function getStoredModelKey(): ModelKey {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'deepseek') return 'auto' // Auto uses DeepSeek; migrate stored deepseek to auto
    if (raw && MODEL_OPTIONS.some(o => o.key === raw)) return raw as ModelKey
  } catch (_) {}
  return 'auto'
}

export function setStoredModelKey(key: ModelKey): void {
  try {
    localStorage.setItem(STORAGE_KEY, key)
  } catch (_) {}
}

export function getModelLabel(key: ModelKey): string {
  if (key === 'deepseek') return 'Auto' // Auto uses DeepSeek; treat stored "deepseek" as Auto
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

export interface ModelPickerProps {
  value: ModelKey
  onChange: (key: ModelKey) => void
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
  const [models, setModels] = useState<BackendModelRow[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const currentModel = models.find(m => m.id === selectedModelId) || null
  const fallbackLabel = getModelLabel(value)
  const currentLabel = currentModel ? (currentModel.displayName || currentModel.name || fallbackLabel) : fallbackLabel
  const isFreePlan = (planId ?? '').toUpperCase() === 'FREE'

  // Load models from backend so the picker mirrors Admin → Models.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiClient.get<BackendModelRow[]>('/chat/models')
        if (cancelled) return
        const list = (Array.isArray(res.data) ? res.data : []).filter(m => m && m.isActive)
        setModels(list)

        // Restore previously selected model if possible.
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
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  return (
    <div className={`model-picker ${className ?? ''} ${open ? 'open' : ''}`} ref={containerRef}>
      <button
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
        <div className="model-picker-dropdown" role="listbox">
          {(models.length ? models : []).map((m) => {
            const key = getModelKeyForRow(m)
            const locked = isFreePlan && key !== 'auto'
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={selectedModelId === m.id}
                aria-disabled={locked}
                className={`model-picker-option ${selectedModelId === m.id ? 'selected' : ''} ${locked ? 'locked' : ''}`}
                onClick={() => {
                  if (locked || disabled) return
                  const nextKey = key
                  setSelectedModelId(m.id)
                  onChange(nextKey)
                  setStoredModelKey(nextKey)
                  try {
                    localStorage.setItem(STORAGE_MODEL_ID_KEY, m.id)
                  } catch (_) {}
                  setOpen(false)
                }}
              >
                <span className="model-picker-option-label">{m.displayName || m.name}</span>
                {locked && <span className="model-picker-option-tag">Pro</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ModelPicker
