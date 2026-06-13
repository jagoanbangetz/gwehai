import './Features.css'

const Features = () => {
  const features = [
    {
      title: 'Automated Penetration Testing',
      subtitle: 'Professional-Grade Security Assessment',
      description: 'GwehAI automates the entire penetration testing workflow, from reconnaissance to exploit validation and report generation.',
      highlight: 'Enterprise-grade security testing with AI-powered vulnerability detection and exploit recognition.',
      items: [
        {
          icon: 'fa-solid fa-bug',
          title: 'Exploit Recognition',
          description: 'Advanced AI algorithms recognize and classify exploits across multiple attack vectors including web applications, networks, and APIs.',
        },
        {
          icon: 'fa-solid fa-radar',
          title: 'Vulnerability Scanning',
          description: 'Comprehensive automated scanning that identifies security weaknesses, misconfigurations, and potential attack surfaces.',
        },
        {
          icon: 'fa-solid fa-file-shield',
          title: 'Report Generation',
          description: 'Generate detailed, professional pentest reports with executive summaries, technical findings, and remediation recommendations.',
        },
        {
          icon: 'fa-solid fa-diagram-project',
          title: 'Multi-Vector Testing',
          description: 'Conduct security assessments across web applications, network infrastructure, APIs, cloud environments, and mobile applications.',
        },
        {
          icon: 'fa-solid fa-bolt',
          title: 'Real-Time Threat Analysis',
          description: 'Continuous monitoring and analysis of security threats with real-time alerts and actionable insights.',
        },
      ],
    },
    {
      title: 'AI Security Chat',
      description: 'Chat with GwehAI to get instant security guidance, vulnerability explanations, and pentesting advice.',
      items: [
        {
          icon: 'fa-solid fa-comments',
          title: 'Intelligent Security Chat',
          description: 'Interactive AI chat agent that provides expert security guidance, explains vulnerabilities, and helps with penetration testing strategies.',
        },
        {
          icon: 'fa-solid fa-magnifying-glass-chart',
          title: 'Exploit Analysis',
          description: 'Get detailed explanations of discovered exploits, their impact, CVSS scores, and recommended mitigation strategies.',
        },
        {
          icon: 'fa-solid fa-flask',
          title: 'Custom Testing Scenarios',
          description: 'Describe your security testing needs in natural language, and GwehAI will create custom testing scenarios and attack vectors.',
        },
        {
          icon: 'fa-solid fa-shield-halved',
          title: 'Security Best Practices',
          description: 'Get recommendations on security best practices, compliance requirements, and industry-standard security frameworks.',
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
          description: 'High-level executive summaries with risk ratings, business impact analysis, and strategic recommendations for stakeholders.',
        },
        {
          icon: 'fa-solid fa-code',
          title: 'Technical Deep Dives',
          description: 'Detailed technical reports with proof-of-concept exploits, code snippets, network diagrams, and step-by-step remediation guides.',
        },
        {
          icon: 'fa-solid fa-list-check',
          title: 'Compliance Mapping',
          description: 'Automatically map findings to compliance frameworks like OWASP Top 10, CWE, NIST, PCI-DSS, and GDPR requirements.',
        },
        {
          icon: 'fa-solid fa-chart-line',
          title: 'Trend Analysis & Dashboards',
          description: 'Track security posture over time with visual dashboards, trend analysis, and comparative security assessments.',
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
