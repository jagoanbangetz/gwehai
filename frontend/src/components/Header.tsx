import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { logo } from '../assets/images'
import './Header.css'

const Header = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup'
  const { user, logout, isAuthenticated } = useAuth()

  if (isAuthPage) return null

  const scrollToSection = (id: string) => {
    if (location.pathname !== '/') {
      navigate({ pathname: '/', hash: id })
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
          <span className="logo-badge">AI</span>
        </Link>
        <nav className="nav">
          <button onClick={() => scrollToSection('features')} className="nav-link">
            Features
          </button>
          <Link to="/methodology" className="nav-link">
            Methodology
          </Link>
          <Link to="/pricing" className="nav-link">
            Pricing
          </Link>
          <Link to="/contact" className="nav-link">
            Contact
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
              <Link to="/signup" className="cta-button">
                <i className="fa-solid fa-arrow-right"></i> Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export default Header
