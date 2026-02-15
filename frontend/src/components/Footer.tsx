import { Link } from 'react-router-dom'
import './Footer.css'

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-section">
          <h3 className="footer-title">Start with GwehAI</h3>
          <p className="footer-subtitle">
            Join top Fortune 500 companies using GwehAI for automated penetration testing.
          </p>
          <Link to="/signup" className="hero-button primary">Get Started</Link>
          <div className="footer-features">
            <span>Professional reports</span>
            <span>Enterprise-grade security</span>
            <span>24/7 AI assistance</span>
          </div>
        </div>
        <div className="footer-links">
          <div className="footer-column">
            <h4 className="footer-column-title">Resources</h4>
            <Link to="/pricing" className="footer-link">Pricing</Link>
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Security Blog</a>
            <Link to="/careers" className="footer-link">Careers</Link>
          </div>
          <div className="footer-column">
            <h4 className="footer-column-title">Product</h4>
            <Link to={{ pathname: '/', hash: 'features' }} className="footer-link">Pentesting</Link>
            <Link to={{ pathname: '/', hash: 'chat' }} className="footer-link">AI Chat</Link>
            <Link to="/" className="footer-link">API</Link>
            <Link to={{ pathname: '/', hash: 'reports' }} className="footer-link">Reports</Link>
          </div>
          <div className="footer-column">
            <h4 className="footer-column-title">Legal</h4>
            <Link to="/terms" className="footer-link">Terms of Service</Link>
            <Link to="/privacy" className="footer-link">Privacy Policy</Link>
            <Link to="/contact" className="footer-link">Contact Us</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <p>©2025 GwehAI. 535 Mission Street, San Francisco, CA, USA</p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
