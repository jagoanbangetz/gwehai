import { Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import apiClient from '../utils/api'

interface AdminRouteProps {
  children: React.ReactNode
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { isAuthenticated, authReady } = useAuth()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    if (!authReady || !isAuthenticated) {
      setIsAdmin(null)
      return
    }

    let cancelled = false
    apiClient
      .get('/auth/me')
      .then((res) => {
        if (!cancelled) {
          setIsAdmin((res?.data?.role || '').toLowerCase() === 'admin')
        }
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false)
      })

    return () => {
      cancelled = true
    }
  }, [authReady, isAuthenticated])

  // Wait for auth to hydrate from localStorage before deciding access
  if (!authReady) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (isAdmin === null) {
    return null
  }

  if (!isAdmin) {
    return <Navigate to="/forbidden" replace />
  }

  return <>{children}</>
}

export default AdminRoute

