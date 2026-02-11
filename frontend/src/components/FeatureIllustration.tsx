import { useEffect, useRef } from 'react'
import './FeatureIllustration.css'

interface FeatureIllustrationProps {
  feature: 'exploit' | 'report' | 'chat' | 'automation'
  title: string
  description: string
}

const FeatureIllustration = ({ feature, title, description }: FeatureIllustrationProps) => {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    // Animate connections on mount
    const lines = svgRef.current?.querySelectorAll('.connection-line')
    lines?.forEach((line, index) => {
      setTimeout(() => {
        line.classList.add('animate')
      }, index * 200)
    })
  }, [])

  const renderFeatureIcon = () => {
    switch (feature) {
      case 'exploit':
        return (
          <>
            <circle cx="300" cy="200" r="60" className="feature-cloud" />
            <path d="M280 200 L300 180 L320 200 L300 220 Z" fill="rgba(220, 38, 38, 0.6)" className="feature-icon" />
            <circle cx="300" cy="200" r="3" className="feature-dot" />
          </>
        )
      case 'report':
        return (
          <>
            <rect x="250" y="150" width="100" height="120" className="feature-document" />
            <line x1="270" y1="180" x2="330" y2="180" stroke="rgba(99, 102, 241, 0.6)" strokeWidth="2" />
            <line x1="270" y1="210" x2="330" y2="210" stroke="rgba(99, 102, 241, 0.6)" strokeWidth="2" />
            <line x1="270" y1="240" x2="300" y2="240" stroke="rgba(99, 102, 241, 0.6)" strokeWidth="2" />
            <circle cx="300" cy="200" r="3" className="feature-dot" />
          </>
        )
      case 'chat':
        return (
          <>
            <circle cx="300" cy="200" r="50" className="feature-chat" />
            <path d="M250 200 Q280 180 300 200 Q320 180 350 200 L300 250 Z" fill="rgba(99, 102, 241, 0.3)" />
            <circle cx="300" cy="200" r="3" className="feature-dot" />
          </>
        )
      case 'automation':
        return (
          <>
            <circle cx="300" cy="200" r="60" className="feature-automation" />
            <circle cx="280" cy="180" r="8" fill="rgba(99, 102, 241, 0.6)" />
            <circle cx="320" cy="180" r="8" fill="rgba(99, 102, 241, 0.6)" />
            <circle cx="300" cy="220" r="8" fill="rgba(99, 102, 241, 0.6)" />
            <circle cx="300" cy="200" r="3" className="feature-dot" />
          </>
        )
      default:
        return null
    }
  }

  return (
    <div className="feature-illustration">
      <div className="feature-illustration-content">
        <div className="feature-illustration-svg">
          <svg ref={svgRef} viewBox="0 0 600 400" preserveAspectRatio="xMidYMid meet">
            <defs>
              <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(99, 102, 241, 0.1)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-pattern)" />
            
            {/* Central Feature */}
            <g className="feature-center">
              {renderFeatureIcon()}
            </g>

            {/* Network Nodes */}
            <g className="network-node" style={{ transform: 'translate(100, 100)' }}>
              <circle cx="0" cy="0" r="30" className="node-circle" />
              <circle cx="0" cy="0" r="3" className="node-dot" />
            </g>

            <g className="network-node" style={{ transform: 'translate(500, 100)' }}>
              <circle cx="0" cy="0" r="30" className="node-circle" />
              <circle cx="0" cy="0" r="3" className="node-dot" />
            </g>

            <g className="network-node" style={{ transform: 'translate(100, 300)' }}>
              <circle cx="0" cy="0" r="30" className="node-circle" />
              <circle cx="0" cy="0" r="3" className="node-dot" />
            </g>

            <g className="network-node" style={{ transform: 'translate(500, 300)' }}>
              <circle cx="0" cy="0" r="30" className="node-circle" />
              <circle cx="0" cy="0" r="3" className="node-dot" />
            </g>

            {/* Connection Lines */}
            <line x1="300" y1="200" x2="100" y2="100" className="connection-line" />
            <line x1="300" y1="200" x2="500" y2="100" className="connection-line" />
            <line x1="300" y1="200" x2="100" y2="300" className="connection-line" />
            <line x1="300" y1="200" x2="500" y2="300" className="connection-line" />
          </svg>
        </div>
        <div className="feature-illustration-text">
          <h3 className="feature-illustration-title">{title}</h3>
          <p className="feature-illustration-description">{description}</p>
        </div>
      </div>
    </div>
  )
}

export default FeatureIllustration
