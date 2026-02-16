import React, { useState, useRef, useEffect } from 'react'
import './ModelPicker.css'

export type ModelKey = 'auto' | 'deepseek' | 'openai_gpt5' | 'claude'

export const MODEL_OPTIONS: { key: ModelKey; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'openai_gpt5', label: 'OpenAI GPT5' },
  { key: 'claude', label: 'Claude' },
]

const STORAGE_KEY = 'gwehai_model_key'

export function getStoredModelKey(): ModelKey {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
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
  return MODEL_OPTIONS.find(o => o.key === key)?.label ?? key
}

export interface ModelPickerProps {
  value: ModelKey
  onChange: (key: ModelKey) => void
  disabled?: boolean
  className?: string
}

/**
 * Compact pill/dropdown for model selection (Auto, DeepSeek, OpenAI GPT5, Claude).
 * Persists to localStorage; parent should sync to backend user preference if available.
 */
const ModelPicker: React.FC<ModelPickerProps> = ({ value, onChange, disabled, className }) => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const currentLabel = getModelLabel(value)

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
          {MODEL_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              role="option"
              aria-selected={value === opt.key}
              className={`model-picker-option ${value === opt.key ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt.key)
                setStoredModelKey(opt.key)
                setOpen(false)
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ModelPicker
