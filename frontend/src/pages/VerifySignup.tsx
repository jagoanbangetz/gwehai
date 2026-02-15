import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { logo } from '../assets/images'
import AnimatedBackground from '../components/AnimatedBackground'
import './Auth.css'

const VerifySignup = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { verifySignupToken, isAuthenticated } = useAuth()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')

  const token = searchParams.get('token')

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/agent', { replace: true })
      return
    }
    if (!token?.trim()) {
      setStatus('error')
      setError('Missing verification link. Please use the link from your email or sign up again.')
      return
    }
    let cancelled = false
    verifySignupToken(token)
      .then((ok) => {
        if (cancelled) return
        if (ok) {
          setStatus('success')
          navigate('/agent?toast=verified', { replace: true })
        } else {
          setStatus('error')
          setError('Invalid or expired link. Please sign up again.')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error')
          setError('Something went wrong. Please try again or sign up again.')
        }
      })
    return () => { cancelled = true }
  }, [token, verifySignupToken, isAuthenticated, navigate])

  return (
    <div className="auth-page dark-theme">
        <AnimatedBackground variant="full" intensity="high" />
        <div className="auth-container">
          <div className="auth-modal">
            <div className="auth-modal-header">
              <div className="auth-logo">
                <img src={logo} alt="GwehAI" className="auth-logo-image" />
              </div>
            </div>
            <div className="auth-content">
              <h1 className="auth-title">Verify your email</h1>
              {status === 'loading' && (
                <p className="auth-otp-hint" style={{ textAlign: 'center', marginTop: '1rem' }}>
                  Verifying your email...
                </p>
              )}
              {status === 'error' && (
                <>
                  <div className="auth-error">
                    <span>[ERROR]</span>
                    <span>{error}</span>
                  </div>
                  <Link to="/signup" className="auth-continue-button" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                    Sign up again
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
  )
}

export default VerifySignup
