import { useNavigate } from 'react-router-dom'
import './Hero.css'

const Hero = () => {
  const navigate = useNavigate()

  return (
    <section className="hero">
      <div className="hero-container">
        <div className="hero-eyebrow">
          <i className="fa-solid fa-shield-halved"></i>
          AI-Powered Cybersecurity Platform
        </div>

        <h1 className="hero-title">
          Automate Your
          <br />
          <span className="hero-title-accent">Penetration Testing</span>
        </h1>

        <p className="hero-description">
          GwehAI is an advanced AI agent that automates the entire pentest workflow
          — from reconnaissance to exploit validation and professional report generation.
          Enterprise-grade security testing, powered by AI.
        </p>

        <div className="hero-cta">
          <button className="hero-button primary" onClick={() => navigate('/signup')}>
            <i className="fa-solid fa-rocket"></i>
            Start Pentesting
          </button>
          <button className="hero-button secondary" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>
            <i className="fa-solid fa-play"></i>
            See Features
          </button>
        </div>

        <div className="hero-terminal-preview">
          <div className="terminal-preview-window">
            <div className="terminal-preview-header">
              <div className="terminal-preview-dots">
                <span className="dot red"></span>
                <span className="dot yellow"></span>
                <span className="dot green"></span>
              </div>
              <span className="terminal-preview-title">gwehai@pentest</span>
            </div>
            <div className="terminal-preview-body">
              <div className="terminal-line">
                <span className="t-prompt">$</span>
                <span className="t-cmd">gwehai scan --target example.com</span>
              </div>
              <div className="terminal-line">
                <span className="t-info">[INFO]</span>
                <span className="t-text">Initializing AI security agent...</span>
              </div>
              <div className="terminal-line">
                <span className="t-info">[SCAN]</span>
                <span className="t-text">Scanning ports: 80, 443, 8080, 8443</span>
              </div>
              <div className="terminal-line">
                <span className="t-warn">[WARN]</span>
                <span className="t-text">SQL injection detected at /api/search</span>
              </div>
              <div className="terminal-line">
                <span className="t-crit">[CRIT]</span>
                <span className="t-text">Authentication bypass in /admin</span>
              </div>
              <div className="terminal-line">
                <span className="t-prompt">$</span>
                <span className="t-cmd">gwehai report --format pdf</span>
              </div>
              <div className="terminal-line success">
                <span className="t-check"><i className="fa-solid fa-circle-check"></i></span>
                <span className="t-text">Report generated — 12 vulnerabilities found</span>
              </div>
              <div className="terminal-line">
                <span className="t-cursor">▊</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
