import { useState } from 'react'
import { Link } from 'react-router-dom'
import { logo } from '../assets/images'
import AnimatedBackground from '../components/AnimatedBackground'
import './Auth.css'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const ForgotPassword = () => {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    if (!email.trim()) {
      setError('Enter your email address')
      setIsLoading(false)
      return
    }
    try {
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.message || 'Something went wrong')
        setIsLoading(false)
        return
      }
      setSent(true)
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
                <i className="fa-solid fa-xmark" />
              </Link>
            </div>
            <div className="auth-content">
              <h1 className="auth-title">Reset your password</h1>
              {sent ? (
                <p className="auth-otp-hint" style={{ marginTop: '1rem' }}>
                  If an account exists with that email, you will receive a password reset link shortly. Check your inbox and spam folder.
                </p>
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
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setError('') }}
                        placeholder="Email address"
                        required
                        className="form-input dark-input"
                        autoFocus
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
                          Sending...
                        </>
                      ) : (
                        'Send reset link'
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

export default ForgotPassword
