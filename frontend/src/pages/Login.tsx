import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { logo } from '../assets/images'
import AnimatedBackground from '../components/AnimatedBackground'
import './Auth.css'

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled or denied.',
  google_auth_failed: 'Google sign-in failed. Please try again or use email/password.',
  email_required: 'Google did not provide an email. Please allow email access and try again.',
  redirect_uri_wrong:
    'Wrong redirect URI: Google is calling the frontend instead of the backend. In Google Console → Credentials → your OAuth client → Authorized redirect URIs, add the BACKEND URL. Open http://localhost:3001/api/auth/google/redirect-uri to see the exact URL to copy (use your backend port if different).',
}

const Login = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [showOtpForm, setShowOtpForm] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [otp, setOtp] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { login, verifyLoginOtp, isAuthenticated } = useAuth()

  useEffect(() => {
    const q = searchParams.get('error')
    if (q) {
      setError(GOOGLE_ERROR_MESSAGES[q] || GOOGLE_ERROR_MESSAGES.google_auth_failed)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/agent', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    setError('')
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    if (!formData.email || !formData.password) {
      setError('Please fill in all fields')
      setIsLoading(false)
      return
    }
    try {
      const result = await login(formData.email, formData.password)
      if (result.success) {
        navigate('/agent?toast=login')
        return
      }
      if ('requiresOtp' in result && result.requiresOtp) {
        setShowOtpForm(true)
        setError('')
        return
      }
      setError((result as { message?: string }).message || 'Invalid email or password')
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    if (!otp.trim()) {
      setError('Enter the 6-digit code from your email')
      setIsLoading(false)
      return
    }
    try {
      const success = await verifyLoginOtp(formData.email, otp.trim())
      if (success) {
        navigate('/agent?toast=login')
      } else {
        setError('Invalid or expired code. Try again or sign in again.')
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = () => {
    const apiBase = import.meta.env.VITE_API_URL || ''
    window.location.href = `${apiBase}/api/auth/google`.replace(/([^:]\/)\/+/g, '$1')
  }

  return (
    <div className="auth-page">
      <AnimatedBackground variant="full" intensity="low" />
      <div className="auth-container">
        <div className="auth-modal">
          <div className="auth-modal-header">
            <div className="auth-logo">
              <img src={logo} alt="GwehAI" className="auth-logo-image" />
            </div>
            <Link to="/" className="auth-close">
              <i className="fa-solid fa-xmark"></i>
            </Link>
          </div>

          <div className="auth-content">
            <h1 className="auth-title">
              {showOtpForm ? 'Enter verification code' : 'Log into your account'}
            </h1>

            {error && (
              <div className="auth-error">
                <i className="fa-solid fa-circle-exclamation"></i>
                <span>{error}</span>
              </div>
            )}

            {showOtpForm ? (
              <form onSubmit={handleOtpSubmit} className="auth-email-form">
                <p className="auth-otp-hint">
                  We sent a 6-digit code to <strong>{formData.email}</strong>. Enter it below.
                </p>
                <div className="form-group">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => {
                      setOtp(e.target.value.replace(/\D/g, ''))
                      setError('')
                    }}
                    placeholder="000000"
                    className="form-input dark-input auth-otp-input"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  className="auth-continue-button"
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? (
                    <>
                      <span className="spinner"></span>
                      Verifying...
                    </>
                  ) : (
                    'Verify and sign in'
                  )}
                </button>
                <button
                  type="button"
                  className="auth-back-link"
                  onClick={() => { setShowOtpForm(false); setOtp(''); setError(''); }}
                >
                  <i className="fa-solid fa-arrow-left"></i> Back to sign in
                </button>
              </form>
            ) : !showEmailForm ? (
              <>
                <div className="auth-options">
                  <button
                    type="button"
                    className="auth-option-button google-button"
                    onClick={handleGoogleLogin}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </button>
                  <button
                    type="button"
                    className="auth-option-button email-button"
                    onClick={() => setShowEmailForm(true)}
                  >
                    <i className="fa-solid fa-envelope"></i>
                    Email and password
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleEmailSubmit} className="auth-email-form">
                <div className="form-group">
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Email address"
                    required
                    className="form-input dark-input"
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Password"
                    required
                    className="form-input dark-input"
                  />
                </div>
                <div className="auth-form-links">
                  <Link to="/forgot-password" className="forgot-link">Forgot password?</Link>
                </div>
                <button
                  type="submit"
                  className="auth-continue-button"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span className="spinner"></span>
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </button>
              </form>
            )}

            {!showOtpForm && (
              <div className="auth-footer">
                <p>
                  No account yet?{' '}
                  <Link to="/signup" className="auth-link">Sign up</Link>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
