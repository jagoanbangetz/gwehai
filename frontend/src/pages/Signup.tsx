import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { logo } from '../assets/images'
import AnimatedBackground from '../components/AnimatedBackground'
import './Auth.css'

const Signup = () => {
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [showOtpForm, setShowOtpForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeToTerms: false,
  })
  const [otp, setOtp] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { signup, verifySignupOtp, isAuthenticated } = useAuth()

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/agent', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setFormData({ ...formData, [e.target.name]: value })
    setError('')
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    if (!formData.name || !formData.email || !formData.password) {
      setError('Please fill in all fields')
      setIsLoading(false)
      return
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters')
      setIsLoading(false)
      return
    }
    if (!formData.agreeToTerms) {
      setError('Please agree to the terms and conditions')
      setIsLoading(false)
      return
    }
    try {
      const result = await signup(formData.name, formData.email, formData.password)
      if (result.success) {
        navigate('/agent?toast=register')
        return
      }
      if ('requiresOtp' in result && result.requiresOtp) {
        setShowOtpForm(true)
        setError('')
        return
      }
      setError((result as { message?: string }).message || 'Signup failed')
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
      const success = await verifySignupOtp(formData.email, otp.trim())
      if (success) {
        navigate('/agent?toast=verified')
      } else {
        setError('Invalid or expired code. Check your email or sign up again.')
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignup = () => {
    const apiBase = import.meta.env.VITE_API_URL || ''
    window.location.href = `${apiBase}/api/auth/google`.replace(/([^:]\/)\/+/g, '$1')
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
              <Link to="/" className="auth-close">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </Link>
            </div>

            <div className="auth-content">
              <h1 className="auth-title">
                {showOtpForm ? 'Verify your email' : 'Create your account'}
              </h1>

              {error && (
                <div className="auth-error">
                  <span>[ERROR]</span>
                  <span>{error}</span>
                </div>
              )}

              {showOtpForm ? (
                <form onSubmit={handleOtpSubmit} className="auth-email-form">
                  <p className="auth-otp-hint">
                    We sent a verification link and code to <strong>{formData.email}</strong>. Enter the 6-digit code below, or click the link in the email.
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
                      'Verify and create account'
                    )}
                  </button>
                  <button
                    type="button"
                    className="auth-back-link"
                    onClick={() => { setShowOtpForm(false); setOtp(''); setError(''); }}
                  >
                    ← Back to sign up
                  </button>
                </form>
              ) : !showEmailForm ? (
                <>
                  <div className="auth-options">
                    <button
                      type="button"
                      className="auth-option-button google-button"
                      onClick={handleGoogleSignup}
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
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                      Email and password
                    </button>
                  </div>
                </>
              ) : (
                <form onSubmit={handleEmailSubmit} className="auth-email-form">
                  <div className="form-group">
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Full name"
                      required
                      className="form-input dark-input"
                      autoFocus
                    />
                  </div>
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
                    />
                  </div>
                  <div className="form-group">
                    <input
                      type="password"
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="Password (min 8 characters)"
                      required
                      className="form-input dark-input"
                    />
                  </div>
                  <div className="form-group">
                    <input
                      type="password"
                      id="confirmPassword"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder="Confirm password"
                      required
                      className="form-input dark-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="checkbox-label" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                      <input
                        type="checkbox"
                        name="agreeToTerms"
                        checked={formData.agreeToTerms}
                        onChange={handleChange}
                        required
                        style={{ accentColor: 'white' }}
                      />
                      <span>
                        I agree to the{' '}
                        <Link to="/terms" className="inline-link" style={{ color: 'white' }} onClick={(e) => e.stopPropagation()}>Terms of Service</Link>
                        {' '}and{' '}
                        <Link to="/privacy" className="inline-link" style={{ color: 'white' }} onClick={(e) => e.stopPropagation()}>Privacy Policy</Link>
                      </span>
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="auth-continue-button"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <span className="spinner"></span>
                        Creating account...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </button>
                </form>
              )}

              {!showOtpForm && (
                <div className="auth-footer">
                  <p>
                    Already have an account?{' '}
                    <Link to="/login" className="auth-link">Sign in</Link>
                  </p>
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  )
}

export default Signup
