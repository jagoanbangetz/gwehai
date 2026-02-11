import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { logo } from '../assets/images'
import './Header.css'

const Header = () => {
  const location = useLocation()
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup'
  const { user, logout, isAuthenticated } = useAuth()

  if (isAuthPage) return null

  const scrollToSection = (id: string) => {
    if (location.pathname !== '/') {
      // If not on home page, navigate to home first
      window.location.href = `/#${id}`
      return
    }
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleLogout = () => {
    logout()
  }

  return (
    <header className="header">
      <div className="header-container">
        <Link to="/" className="logo">
          <img src={logo} alt="GwehAI" className="logo-image" />
          <span className="logo-text">Gweh</span>
          <span className="logo-badge">[AI]</span>
        </Link>
        <nav className="nav">
          <button onClick={() => scrollToSection('features')} className="nav-link">
            Features
          </button>
          <button onClick={() => scrollToSection('reports')} className="nav-link">
            Reports
          </button>
          <Link to="/pricing" className="nav-link">
            Pricing
          </Link>
        </nav>
        <div className="header-actions">
          {isAuthenticated ? (
            <>
              <Link to="/agent" className="header-link">Agent</Link>
              <span className="user-info">
                <span className="user-name">{user?.name || user?.email}</span>
              </span>
              <button onClick={handleLogout} className="header-link logout-button">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="header-link">Sign In</Link>
              <Link to="/signup" className="cta-button">Get Started</Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export default Header
