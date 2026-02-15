import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const API_BASE = import.meta.env.VITE_API_URL || ''

const GoogleCallback = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { refreshUser, isAuthenticated } = useAuth()
  const [tokenProcessed, setTokenProcessed] = useState(false)

  useEffect(() => {
    const rawToken = searchParams.get('token')
    const token = rawToken ? decodeURIComponent(rawToken).trim() : null
    const error = searchParams.get('error')

    console.log('[GoogleCallback] Page loaded. URL has token:', !!token, 'error:', error || 'none')

    if (error) {
      console.error('[GoogleCallback] OAuth error:', error)
      navigate(`/login?error=${encodeURIComponent(error)}`, { replace: true })
      return
    }

    const hasCode = searchParams.get('code')
    if (!token) {
      if (hasCode) {
        console.error(
          '[GoogleCallback] URL has "code" from Google but no "token". ' +
          'You set the wrong redirect URI in Google Console. It must be your BACKEND URL, not the frontend.',
        )
        navigate('/login?error=redirect_uri_wrong', { replace: true })
        return
      }
      console.warn('[GoogleCallback] No token in URL – redirect may have gone to wrong URL or backend did not send token')
      navigate('/login')
      return
    }

    const meUrl = `${API_BASE}/api/auth/me`.replace(/([^:]\/)\/+/g, '$1')
    console.log('[GoogleCallback] Fetching user from:', meUrl)

    fetch(meUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
    })
      .then(res => {
        if (!res.ok) {
          console.error('[GoogleCallback] /me failed:', res.status, res.statusText)
          throw new Error(`/me failed: ${res.status}`)
        }
        return res.json()
      })
        .then(data => {
          const userData = {
            id: data.id || data.sub,
            email: data.email,
            name: data.name,
            token,
            access_token: token,
            googleId: data.googleId ?? null,
            role: data.role,
            avatarUrl: data.avatarUrl,
          }
          localStorage.setItem('scout_user', JSON.stringify(userData))
        refreshUser()
        console.log('[GoogleCallback] Session saved, user:', data.email)
        setTokenProcessed(true)
      })
      .catch(err => {
        console.error('[GoogleCallback] Error:', err)
        navigate('/login?error=google_auth_failed')
      })
  }, [searchParams, navigate, refreshUser])

  // Navigate to /agent only after auth state has updated (avoids ProtectedRoute redirecting back to login)
  useEffect(() => {
    if (tokenProcessed && isAuthenticated) {
      navigate('/agent?toast=google', { replace: true })
    }
  }, [tokenProcessed, isAuthenticated, navigate])

  // Show loading state
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      color: 'white',
      fontFamily: 'monospace',
      background: '#000'
    }}>
      <div>
        <p>Completing Google sign in...</p>
      </div>
    </div>
  )
}

export default GoogleCallback
