import { useNavigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import './Hero.css'

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  size: 3 + Math.random() * 4,
  x: Math.random() * 100,
  y: Math.random() * 100,
  delay: Math.random() * 6,
  duration: 8 + Math.random() * 10,
  opacity: 0.15 + Math.random() * 0.25,
}))

const Hero = () => {
  const navigate = useNavigate()
  const heroRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const section = heroRef.current
    if (!section) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        section.classList.toggle('hero-visible', entry.isIntersecting)
      },
      { threshold: 0.15 }
    )
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="hero" ref={heroRef}>
      {/* Floating particles */}
      <div className="hero-particles" aria-hidden="true">
        {PARTICLES.map((p) => (
          <span
            key={p.id}
            className="hero-particle"
            style={{
              width: p.size,
              height: p.size,
              left: `${p.x}%`,
              top: `${p.y}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              opacity: p.opacity,
            }}
          />
        ))}
      </div>

      <div className="hero-container">
        <div className="hero-eyebrow">
          <i className="fa-solid fa-shield-halved"></i>
          AI-Powered Cybersecurity Platform
        </div>

        <h1 className="hero-title">
          <span className="hero-title-line">Penetration Testing,</span>
          <span className="hero-title-gradient"> Automated</span>
        </h1>

        <p className="hero-description">
          AI-powered security testing from reconnaissance to professional reporting.
        </p>

        <div className="hero-cta">
          <button className="hero-button primary pulse-btn" onClick={() => navigate('/signup')}>
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
