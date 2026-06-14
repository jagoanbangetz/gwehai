import './Features.css'

const Features = () => {
  const features = [
    {
      title: 'Automated Penetration Testing',
      subtitle: 'Professional-Grade Security Assessment',
      description: 'End-to-end penetration testing — from recon to exploit validation and reporting.',
      highlight: 'AI-powered vulnerability detection with automated exploit recognition.',
      items: [
        {
          icon: 'fa-solid fa-bug',
          title: 'Exploit Recognition',
          description: 'AI classifies exploits across web apps, networks, and APIs.',
        },
        {
          icon: 'fa-solid fa-crosshairs',
          title: 'Vulnerability Scanning',
          description: 'Automated scanning for weaknesses, misconfigurations, and attack surfaces.',
        },
        {
          icon: 'fa-solid fa-file-shield',
          title: 'Report Generation',
          description: 'Detailed pentest reports with executive summaries and remediation guides.',
        },
        {
          icon: 'fa-solid fa-diagram-project',
          title: 'Multi-Vector Testing',
          description: 'Web, network, API, cloud, and mobile security assessments.',
        },
        {
          icon: 'fa-solid fa-bolt',
          title: 'Real-Time Threat Analysis',
          description: 'Continuous monitoring with real-time alerts and actionable insights.',
        },
      ],
    },
    {
      title: 'AI Security Chat',
      description: 'Chat with GwehAI for instant security guidance and vulnerability analysis.',
      items: [
        {
          icon: 'fa-solid fa-comments',
          title: 'Intelligent Security Chat',
          description: 'Expert security guidance, vulnerability explanations, and pentesting strategies.',
        },
        {
          icon: 'fa-solid fa-magnifying-glass-chart',
          title: 'Exploit Analysis',
          description: 'Detailed explanations of exploits, CVSS scores, and mitigation strategies.',
        },
        {
          icon: 'fa-solid fa-flask',
          title: 'Custom Testing Scenarios',
          description: 'Describe your needs in natural language — GwehAI creates custom attack vectors.',
        },
        {
          icon: 'fa-solid fa-shield-halved',
          title: 'Security Best Practices',
          description: 'Compliance, frameworks, and industry-standard security recommendations.',
        },
      ],
    },
    {
      title: 'Advanced Reporting & Analytics',
      subtitle: 'Comprehensive Security Intelligence',
      items: [
        {
          icon: 'fa-solid fa-chart-pie',
          title: 'Executive Summary Reports',
          description: 'Risk ratings, business impact analysis, and strategic recommendations.',
        },
        {
          icon: 'fa-solid fa-code',
          title: 'Technical Deep Dives',
          description: 'Proof-of-concept exploits, code snippets, and step-by-step remediation.',
        },
        {
          icon: 'fa-solid fa-list-check',
          title: 'Compliance Mapping',
          description: 'Automatically map findings to OWASP, CWE, NIST, PCI-DSS, and GDPR.',
        },
        {
          icon: 'fa-solid fa-chart-line',
          title: 'Trend Analysis & Dashboards',
          description: 'Visual dashboards, trend analysis, and comparative security assessments.',
        },
      ],
    },
  ]

  return (
    <section className="features" id="features">
      {features.map((feature, index) => (
        <div key={index} className="feature-section">
          <div className="feature-container">
            <h2 className="feature-title">{feature.title}</h2>
            {feature.subtitle && (
              <h3 className="feature-subtitle">{feature.subtitle}</h3>
            )}
            {feature.description && (
              <p className="feature-description">{feature.description}</p>
            )}
            {feature.highlight && (
              <p className="feature-highlight">{feature.highlight}</p>
            )}

            <div className="feature-grid">
              {feature.items.map((item, itemIndex) => (
                <div key={itemIndex} className="feature-card">
                  <div className="feature-card-icon">
                    <i className={item.icon}></i>
                  </div>
                  <h4 className="feature-card-title">{item.title}</h4>
                  <p className="feature-card-description">{item.description}</p>
                </div>
              ))}
            </div>
            <div className="feature-cta">
              <button className="hero-button primary">Get Started Now</button>
            </div>
          </div>
        </div>
      ))}
    </section>
  )
}

export default Features
