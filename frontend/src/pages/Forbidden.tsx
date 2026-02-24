import { Link } from 'react-router-dom'
import './Auth.css'

const Forbidden = () => {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Forbidden</h1>
        <p className="auth-subtitle">You don&apos;t have permission to access this area.</p>
        <p className="auth-subtitle">If you believe this is a mistake, please contact the administrator.</p>
        <div style={{ marginTop: '1.5rem' }}>
          <Link to="/" className="hero-button primary">
            Go back home
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Forbidden

