import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

interface User {
  id: string
  name: string
  email: string
  role?: string
  googleId?: string
}

export type LoginResult = { success: true } | { success: false; requiresOtp?: true; message?: string }
export type SignupResult = { success: true } | { success: false; requiresOtp?: true; message?: string }

interface AuthContextType {
  user: User | null
  authReady: boolean
  refreshUser: () => void
  login: (email: string, password: string) => Promise<LoginResult>
  verifyLoginOtp: (email: string, otp: string) => Promise<boolean>
  signup: (name: string, email: string, password: string) => Promise<SignupResult>
  verifySignupOtp: (email: string, otp: string) => Promise<boolean>
  verifySignupToken: (token: string) => Promise<boolean>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)

  const refreshUser = () => {
    const storedUser = localStorage.getItem('scout_user')
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser)
        setUser(userData)
      } catch (e) {
        console.error('Error parsing user data:', e)
        localStorage.removeItem('scout_user')
        setUser(null)
      }
    } else {
      setUser(null)
    }
  }

  useEffect(() => {
    const loadUser = () => {
      const storedUser = localStorage.getItem('scout_user')
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser)
          setUser(userData)
        } catch (e) {
          console.error('Error parsing user data:', e)
          localStorage.removeItem('scout_user')
        }
      }
      setAuthReady(true)
    }
    loadUser()
    window.addEventListener('storage', loadUser)
    return () => window.removeEventListener('storage', loadUser)
  }, [])

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json()
      if (!response.ok) {
        return { success: false, message: data.message || 'Invalid credentials' }
      }
      if (data.requiresOtp === true) {
        return { success: false, requiresOtp: true, message: data.message || 'OTP sent to your email.' }
      }
      const userData = { ...data.user, token: data.access_token }
      setUser(userData)
      localStorage.setItem('scout_user', JSON.stringify(userData))
      return { success: true }
    } catch (error) {
      console.error('Login error:', error)
      return { success: false, message: 'An error occurred. Please try again.' }
    }
  }

  const verifyLoginOtp = async (email: string, otp: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/auth/verify-login-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      })
      const data = await response.json()
      if (!response.ok) return false
      const userData = { ...data.user, token: data.access_token }
      setUser(userData)
      localStorage.setItem('scout_user', JSON.stringify(userData))
      return true
    } catch (error) {
      console.error('Verify OTP error:', error)
      return false
    }
  }

  const signup = async (name: string, email: string, password: string): Promise<SignupResult> => {
    try {
      const response = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const data = await response.json()
      if (!response.ok) {
        return { success: false, message: data.message || 'Signup failed' }
      }
      if (data.requiresOtp === true) {
        return { success: false, requiresOtp: true, message: data.message || 'Verification email sent.' }
      }
      const userData = { ...data.user, token: data.access_token }
      setUser(userData)
      localStorage.setItem('scout_user', JSON.stringify(userData))
      return { success: true }
    } catch (error) {
      console.error('Signup error:', error)
      return { success: false, message: 'An error occurred. Please try again.' }
    }
  }

  const verifySignupOtp = async (email: string, otp: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/auth/verify-signup-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      })
      const data = await response.json()
      if (!response.ok) return false
      const userData = { ...data.user, token: data.access_token }
      setUser(userData)
      localStorage.setItem('scout_user', JSON.stringify(userData))
      return true
    } catch (error) {
      console.error('Verify signup OTP error:', error)
      return false
    }
  }

  const verifySignupToken = async (token: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/auth/verify-signup?token=${encodeURIComponent(token)}`)
      const data = await response.json()
      if (!response.ok) return false
      const userData = { ...data.user, token: data.access_token }
      setUser(userData)
      localStorage.setItem('scout_user', JSON.stringify(userData))
      return true
    } catch (error) {
      console.error('Verify signup token error:', error)
      return false
    }
  }

  const logout = () => {
    setUser(null)
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch (_) {
      localStorage.removeItem('scout_user')
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        refreshUser,
        login,
        verifyLoginOtp,
        signup,
        verifySignupOtp,
        verifySignupToken,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
