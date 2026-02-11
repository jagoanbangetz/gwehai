import './NetworkBackground.css'

const NetworkBackground = () => {
  return (
    <div className="network-background">
      <svg className="network-svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        {/* Central Cloud */}
        <g className="cloud-group">
          <path
            d="M600 300 Q550 250 500 250 Q450 250 400 280 Q350 250 300 280 Q250 300 250 350 Q250 400 300 420 Q350 440 400 420 Q450 400 500 420 Q550 440 600 420 Q650 400 700 420 Q750 440 800 420 Q850 400 850 350 Q850 300 800 280 Q750 250 700 280 Q650 250 600 300 Z"
            className="cloud-main"
          />
          <circle cx="600" cy="350" r="3" className="cloud-dot" />
          <circle cx="620" cy="360" r="2" className="cloud-dot" />
          <circle cx="580" cy="360" r="2" className="cloud-dot" />
        </g>

        {/* Network Grid */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* User Icon */}
        <g className="network-node user-node">
          <circle cx="200" cy="200" r="40" className="node-circle" />
          <path d="M200 180 Q200 160 180 160 Q160 160 160 180 Q160 200 180 200 Q200 200 200 180" fill="white" />
          <path d="M160 200 Q160 220 180 240 Q200 260 220 240 Q240 220 240 200" fill="white" />
          <circle cx="200" cy="200" r="3" className="node-dot" />
        </g>

        {/* Globe Icon */}
        <g className="network-node globe-node">
          <circle cx="1000" cy="400" r="40" className="node-circle" />
          <circle cx="1000" cy="400" r="30" fill="none" stroke="white" strokeWidth="2" />
          <path d="M970 400 Q1000 380 1030 400 Q1000 420 970 400" stroke="white" strokeWidth="2" fill="none" />
          <path d="M1000 370 Q1020 400 1000 430 Q980 400 1000 370" stroke="white" strokeWidth="2" fill="none" />
          <circle cx="1000" cy="400" r="3" className="node-dot" />
        </g>

        {/* Building Icon */}
        <g className="network-node building-node">
          <rect x="150" y="500" width="100" height="120" className="node-building" />
          <rect x="170" y="540" width="20" height="20" fill="rgba(99, 102, 241, 0.3)" />
          <rect x="210" y="540" width="20" height="20" fill="rgba(99, 102, 241, 0.3)" />
          <rect x="170" y="580" width="20" height="20" fill="rgba(99, 102, 241, 0.3)" />
          <rect x="210" y="580" width="20" height="20" fill="rgba(99, 102, 241, 0.3)" />
          <circle cx="200" cy="500" r="3" className="node-dot" />
        </g>

        {/* Web App Icon */}
        <g className="network-node web-node">
          <rect x="900" y="550" width="120" height="80" className="node-web" />
          <rect x="900" y="550" width="120" height="20" fill="rgba(99, 102, 241, 0.2)" />
          <rect x="920" y="580" width="80" height="40" fill="rgba(99, 102, 241, 0.1)" />
          <circle cx="1000" cy="550" r="3" className="node-dot" />
        </g>

        {/* Connection Lines */}
        <line x1="600" y1="350" x2="200" y2="200" className="connection-line" />
        <line x1="600" y1="350" x2="1000" y2="400" className="connection-line" />
        <line x1="600" y1="350" x2="200" y2="500" className="connection-line" />
        <line x1="600" y1="350" x2="1000" y2="550" className="connection-line" />
      </svg>
    </div>
  )
}

export default NetworkBackground
