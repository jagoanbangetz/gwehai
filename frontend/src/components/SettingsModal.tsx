import React, { useEffect } from 'react'
import CustomSelect from './CustomSelect'
import './SettingsModal.css'

export interface SettingsData {
  email: string
  password: string
  defaultLanguage: string
  defaultModelId: string
}

export interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  settingsData: SettingsData
  onSettingsDataChange: (data: Partial<SettingsData>) => void
  onSave: () => void
  isSaving: boolean
  user?: { email?: string; googleId?: string } | null
  languageOptions: { value: string; label: string }[]
  modelOptions: { value: string; label: string; icon?: React.ReactNode; tag?: string }[]
  /** If true, email field is read-only (e.g. when managed by Google). */
  emailReadOnly?: boolean
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settingsData,
  onSettingsDataChange,
  onSave,
  isSaving,
  user,
  languageOptions,
  modelOptions,
  emailReadOnly = false,
}) => {
  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="settings-modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="settings-modal">
        <header className="settings-modal__header">
          <h2 id="settings-modal-title" className="settings-modal__title">
            Settings
          </h2>
          <button
            type="button"
            className="settings-modal__close"
            onClick={onClose}
            aria-label="Close settings"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="settings-modal__body">
          {/* Authentication */}
          <section className="settings-modal__section" aria-labelledby="settings-auth-heading">
            <h3 id="settings-auth-heading" className="settings-modal__section-title">
              Authentication
            </h3>
            <div className="settings-modal__fields">
              <div className="settings-modal__field">
                <label htmlFor="settings-google" className="settings-modal__label">
                  Google Account
                </label>
                <button
                  type="button"
                  id="settings-google"
                  className="settings-modal__btn-secondary"
                  onClick={() => {
                    const apiBase = import.meta.env.VITE_API_URL || ''
                    window.location.href = `${apiBase}/api/auth/google`.replace(/([^:]\/)\/+/g, '$1')
                  }}
                >
                  {user?.googleId ? 'Google Account Connected' : 'Connect Google Account'}
                </button>
              </div>
              <div className="settings-modal__field">
                <label htmlFor="settings-email" className="settings-modal__label">
                  Email
                </label>
                <input
                  id="settings-email"
                  type="email"
                  className="settings-modal__input"
                  value={settingsData.email}
                  onChange={(e) => onSettingsDataChange({ email: e.target.value })}
                  disabled={emailReadOnly}
                  readOnly={emailReadOnly}
                  aria-describedby={emailReadOnly ? 'settings-email-help' : undefined}
                  autoComplete="email"
                />
                {emailReadOnly && (
                  <span id="settings-email-help" className="settings-modal__help">
                    Email is managed by your connected account.
                  </span>
                )}
              </div>
              <div className="settings-modal__field">
                <label htmlFor="settings-password" className="settings-modal__label">
                  Password
                </label>
                <input
                  id="settings-password"
                  type="password"
                  className="settings-modal__input"
                  placeholder="Enter new password (leave blank to keep current)"
                  value={settingsData.password}
                  onChange={(e) => onSettingsDataChange({ password: e.target.value })}
                  autoComplete="new-password"
                />
                <span className="settings-modal__help">
                  Leave blank to keep your current password.
                </span>
              </div>
            </div>
          </section>

          {/* Preferences */}
          <section className="settings-modal__section" aria-labelledby="settings-prefs-heading">
            <h3 id="settings-prefs-heading" className="settings-modal__section-title">
              Preferences
            </h3>
            <div className="settings-modal__fields">
              <div className="settings-modal__field">
                <label htmlFor="settings-language" className="settings-modal__label">
                  Default Language
                </label>
                <CustomSelect
                  value={settingsData.defaultLanguage}
                  onChange={(value) => onSettingsDataChange({ defaultLanguage: value })}
                  options={languageOptions}
                  placeholder="Select a language"
                  className="settings-modal__select"
                />
              </div>
              <div className="settings-modal__field">
                <label htmlFor="settings-model" className="settings-modal__label">
                  Default AI Agent
                </label>
                <CustomSelect
                  value={settingsData.defaultModelId}
                  onChange={(value) => onSettingsDataChange({ defaultModelId: value })}
                  options={modelOptions}
                  placeholder="Select a model"
                  className="settings-modal__select"
                />
              </div>
            </div>
          </section>
        </div>

        <footer className="settings-modal__footer">
          <button
            type="button"
            className="settings-modal__btn-primary"
            onClick={onSave}
            disabled={isSaving}
            aria-busy={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </footer>
      </div>
    </div>
  )
}

export default SettingsModal
