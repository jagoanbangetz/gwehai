import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { logo } from '../assets/images'
import AnimatedBackground from '../components/AnimatedBackground'
import './Auth.css'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const ResetPassword = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token.trim()) {
      setError('Invalid reset link. Please request a new password reset.')
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      setIsLoading(false)
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }
    try {
      const response = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), password }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.message || 'Invalid or expired link. Request a new reset.')
        setIsLoading(false)
        return
      }
      setSuccess(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="auth-page dark-theme">
        <AnimatedBackground variant="full" intensity="high" />
        <div className="auth-container">
          <div className="auth-modal">
            <div className="auth-modal-header">
              <div className="auth-logo">
                <img src={logo} alt="GwehAI" className="auth-logo-image" />
              </div>
              <Link to="/login" className="auth-close">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </Link>
            </div>
            <div className="auth-content">
              <h1 className="auth-title">Set new password</h1>
              {success ? (
                <p className="auth-otp-hint" style={{ marginTop: '1rem' }}>
                  Your password has been reset. Redirecting to sign in...
                </p>
              ) : !token.trim() ? (
                <>
                  <div className="auth-error">
                    <span>[ERROR]</span>
                    <span>{error}</span>
                  </div>
                  <Link to="/forgot-password" className="auth-continue-button" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                    Request reset link
                  </Link>
                </>
              ) : (
                <>
                  {error && (
                    <div className="auth-error">
                      <span>[ERROR]</span>
                      <span>{error}</span>
                    </div>
                  )}
                  <form onSubmit={handleSubmit} className="auth-email-form">
                    <div className="form-group">
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError('') }}
                        placeholder="New password (min 8 characters)"
                        required
                        minLength={8}
                        className="form-input dark-input"
                        autoFocus
                      />
                    </div>
                    <div className="form-group">
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
                        placeholder="Confirm new password"
                        required
                        className="form-input dark-input"
                      />
                    </div>
                    <button
                      type="submit"
                      className="auth-continue-button"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <span className="spinner"></span>
                          Resetting...
                        </>
                      ) : (
                        'Reset password'
                      )}
                    </button>
                  </form>
                </>
              )}
              <div className="auth-footer">
                <p>
                  <Link to="/login" className="auth-link">← Back to sign in</Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
  )
}

export default ResetPassword
