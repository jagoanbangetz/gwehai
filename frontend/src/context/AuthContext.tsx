import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface User {
  id: string
  name: string
  email: string
  role?: 'user' | 'admin'
}

interface AuthContextType {
  user: User | null
  authReady: boolean
  login: (email: string, password: string) => Promise<boolean>
  signup: (name: string, email: string, password: string) => Promise<boolean>
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

  // Load user from localStorage on mount so refresh keeps you on the same page
  useEffect(() => {
    const loadUser = () => {
      const storedUser = localStorage.getItem('scout_user')
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser)
          setUser(userData)
        } catch (e) {
          console.error('Error parsing stored user:', e)
          localStorage.removeItem('scout_user')
        }
      }
      setAuthReady(true)
    }
    
    loadUser()
    
    // Listen for storage changes (for cross-tab sync)
    window.addEventListener('storage', loadUser)
    return () => window.removeEventListener('storage', loadUser)
  }, [])

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        return false
      }

      const data = await response.json()
      const userData = {
        ...data.user,
        token: data.access_token,
      }
      setUser(userData)
      localStorage.setItem('scout_user', JSON.stringify(userData))
      return true
    } catch (error) {
      console.error('Login error:', error)
      return false
    }
  }

  const signup = async (name: string, email: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      })

      if (!response.ok) {
        return false
      }

      const data = await response.json()
      const userData = {
        ...data.user,
        token: data.access_token,
      }
      setUser(userData)
      localStorage.setItem('scout_user', JSON.stringify(userData))
      return true
    } catch (error) {
      console.error('Signup error:', error)
      return false
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('scout_user')
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        login,
        signup,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
