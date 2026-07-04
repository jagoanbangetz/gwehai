import './Features.css'

const Features = () => {
  const features = [
    {
      icon: 'fa-solid fa-magnifying-glass',
      title: 'Vulnerability Scanning',
      description: 'Automated scanning for CVEs, misconfigurations, and attack surfaces.',
    },
    {
      icon: 'fa-solid fa-bug',
      title: 'Exploit Recognition',
      description: 'AI classifies exploits across web, network, and API targets.',
    },
    {
      icon: 'fa-solid fa-comments',
      title: 'AI Security Chat',
      description: 'Expert security guidance and pentesting strategies on demand.',
    },
    {
      icon: 'fa-solid fa-file-shield',
      title: 'Report Generation',
      description: 'Professional pentest reports with executive summaries and remediation.',
    },
    {
      icon: 'fa-solid fa-diagram-project',
      title: 'Multi-Vector Testing',
      description: 'Web, network, API, cloud, and mobile security assessments.',
    },
    {
      icon: 'fa-solid fa-list-check',
      title: 'Compliance Mapping',
      description: 'OWASP, CWE, NIST, PCI-DSS, and GDPR compliance built in.',
    },
  ]

  return (
    <section className="features" id="features">
      <div className="features-container">
        <h2 className="features-heading">Everything You Need</h2>
        <p className="features-subheading">A complete pentesting platform in one place.</p>
        <div className="features-grid">
          {features.map((feature, index) => (
            <div key={index} className="feature-card">
              <div className="feature-card-icon">
                <i className={feature.icon}></i>
              </div>
              <h3 className="feature-card-title">{feature.title}</h3>
              <p className="feature-card-desc">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Features
