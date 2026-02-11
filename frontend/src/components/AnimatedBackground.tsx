import { useEffect, useState, useRef } from 'react'
import './AnimatedBackground.css'

interface AnimatedBackgroundProps {
  variant?: 'full' | 'subtle'
  intensity?: 'high' | 'medium' | 'low'
}

const AnimatedBackground = ({ variant = 'full', intensity = 'medium' }: AnimatedBackgroundProps) => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [terminalLines, setTerminalLines] = useState<string[]>([])
  const terminalRef = useRef<HTMLDivElement>(null)
  const lineIndexRef = useRef(0)

  const terminalCommands = [
    '$ gwehai scan --target example.com',
    '$ analyzing security vulnerabilities...',
    '[INFO] SQL injection detected',
    '[WARN] XSS vulnerability found',
    '[CRITICAL] Authentication bypass possible',
    '$ generating pentest report...',
    '✓ Report generated: report_2025.pdf',
    '$ gwehai exploit --check CVE-2024-1234',
    '[SCAN] Port 443: HTTPS enabled',
    '[SCAN] Port 80: HTTP redirect detected',
    '$ gwehai analyze --file config.json',
    '[ANALYSIS] 3 high-risk vulnerabilities found',
    '$ gwehai report --format pdf',
    '✓ Security assessment complete',
    '$ gwehai monitor --continuous',
    '[MONITOR] Real-time threat detection active',
  ]

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 100,
        y: (e.clientY / window.innerHeight - 0.5) * 100,
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (lineIndexRef.current < terminalCommands.length) {
        setTerminalLines(prev => {
          const newLines = [...prev, terminalCommands[lineIndexRef.current]]
          // Keep only last 8 lines visible
          return newLines.slice(-8)
        })
        lineIndexRef.current++
      } else {
        // Reset after showing all commands
        lineIndexRef.current = 0
        setTerminalLines([])
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  const opacity = intensity === 'high' ? 0.4 : intensity === 'medium' ? 0.25 : 0.15

  return (
    <div className={`animated-background terminal-display ${variant}`} style={{ opacity }}>
      {/* Terminal Grid */}
      <div 
        className="terminal-grid"
        style={{
          transform: `translate(${mousePosition.x * 0.05}px, ${mousePosition.y * 0.05}px)`,
        }}
      />

      {/* Terminal Window */}
      <div className="terminal-window" ref={terminalRef}>
        <div className="terminal-header">
          <div className="terminal-controls">
            <span className="control-dot red"></span>
            <span className="control-dot yellow"></span>
            <span className="control-dot green"></span>
          </div>
          <div className="terminal-title">gwehai@terminal:~</div>
        </div>
        <div className="terminal-body">
          {terminalLines.map((line, index) => (
            <div key={index} className="terminal-line">
              <span className="terminal-prompt">$</span>
              <span className="terminal-text">{line}</span>
              <span className="terminal-cursor">▊</span>
            </div>
          ))}
          {terminalLines.length > 0 && (
            <div className="terminal-line active">
              <span className="terminal-prompt">$</span>
              <span className="terminal-text typing">_</span>
            </div>
          )}
        </div>
      </div>

      {/* Geometric Shapes */}
      <div className="geometric-shapes">
        {/* Central Circle with Diamond */}
        <div 
          className="shape-container"
          style={{
            transform: `translate(${mousePosition.x * 0.2}px, ${mousePosition.y * 0.2}px)`,
          }}
        >
          <div className="shape-circle">
            <div className="shape-diamond">
              <div className="shape-dot"></div>
            </div>
          </div>
          {/* Dashed Lines */}
          <svg className="shape-lines" viewBox="0 0 200 200">
            <line x1="0" y1="0" x2="200" y2="200" className="dash-line" />
            <line x1="200" y1="0" x2="0" y2="200" className="dash-line" />
          </svg>
        </div>

        {/* Floating Nodes */}
        <div className="terminal-node node-1">
          <div className="node-pulse"></div>
          <div className="node-core"></div>
        </div>
        <div className="terminal-node node-2">
          <div className="node-pulse"></div>
          <div className="node-core"></div>
        </div>
        <div className="terminal-node node-3">
          <div className="node-pulse"></div>
          <div className="node-core"></div>
        </div>
      </div>

      {/* Connection Lines */}
      <svg className="connection-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="20" y1="30" x2="50" y2="50" className="connection-line" />
        <line x1="80" y1="30" x2="50" y2="50" className="connection-line" />
        <line x1="20" y1="70" x2="50" y2="50" className="connection-line" />
        <line x1="80" y1="70" x2="50" y2="50" className="connection-line" />
      </svg>

      {/* Code Snippets Floating */}
      <div className="code-snippets">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="code-snippet" style={{ animationDelay: `${i * 2}s` }}>
            <span className="code-line">const scan = () ={'>'} {'{'}</span>
            <span className="code-line">  return analyze(target);</span>
            <span className="code-line">{'}'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default AnimatedBackground
