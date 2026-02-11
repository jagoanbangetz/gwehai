import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

const GoogleCallback = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const token = searchParams.get('token')
    const error = searchParams.get('error')

    if (error) {
      console.error('Google OAuth error:', error)
      navigate('/login?error=google_auth_failed')
      return
    }

    if (token) {
      // Get user info from backend
      fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch user info')
          return res.json()
        })
        .then(data => {
          const userData = {
            id: data.id || data.sub,
            email: data.email,
            name: data.name,
            token,
          }
          localStorage.setItem('scout_user', JSON.stringify(userData))
          // Force reload to update auth context
          window.location.href = '/agent'
        })
        .catch(err => {
          console.error('Error fetching user info:', err)
          navigate('/login?error=google_auth_failed')
        })
    } else {
      // No token, redirect to login
      navigate('/login')
    }
  }, [searchParams, navigate])

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
