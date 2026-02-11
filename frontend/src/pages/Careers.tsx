import { Link } from 'react-router-dom'
import Header from '../components/Header'
import Footer from '../components/Footer'
import AnimatedBackground from '../components/AnimatedBackground'
import PageLoader from '../components/PageLoader'
import './Careers.css'

const Careers = () => {
  const openPositions = [
    {
      title: 'Senior Backend Engineer',
      department: 'Engineering',
      location: 'Remote / San Francisco',
      type: 'Full-time',
    },
    {
      title: 'Frontend Developer',
      department: 'Engineering',
      location: 'Remote / San Francisco',
      type: 'Full-time',
    },
    {
      title: 'AI/ML Engineer',
      department: 'Engineering',
      location: 'Remote / San Francisco',
      type: 'Full-time',
    },
    {
      title: 'Security Researcher',
      department: 'Research',
      location: 'Remote',
      type: 'Full-time',
    },
    {
      title: 'Product Manager',
      department: 'Product',
      location: 'San Francisco',
      type: 'Full-time',
    },
    {
      title: 'Customer Success Manager',
      department: 'Support',
      location: 'Remote',
      type: 'Full-time',
    },
  ]

  return (
    <PageLoader>
    <div className="careers-page dark-theme">
      <AnimatedBackground variant="full" intensity="low" />
      <Header />
      <main className="careers-content">
        <div className="careers-container">
          <div className="careers-hero">
            <h1 className="careers-title">Join Our Team</h1>
            <p className="careers-subtitle">
              We're building the future of AI-powered cybersecurity. Join us in making the digital world safer.
            </p>
          </div>

          <section className="careers-why">
            <h2>Why Work at GwehAI?</h2>
            <div className="benefits-grid">
              <div className="benefit-card">
                <div className="benefit-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
                    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
                    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
                  </svg>
                </div>
                <h3>Cutting-Edge Technology</h3>
                <p>Work with the latest AI and cybersecurity technologies</p>
              </div>
              <div className="benefit-card">
                <div className="benefit-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    <path d="M2 12h20"/>
                  </svg>
                </div>
                <h3>Remote First</h3>
                <p>Work from anywhere in the world</p>
              </div>
              <div className="benefit-card">
                <div className="benefit-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 11a3 3 0 1 0 6 0 3 3 0 0 0-6 0z"/>
                    <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z"/>
                    <path d="M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/>
                  </svg>
                </div>
                <h3>Innovation</h3>
                <p>Be part of a team that's shaping the future</p>
              </div>
              <div className="benefit-card">
                <div className="benefit-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                </div>
                <h3>Work-Life Balance</h3>
                <p>Flexible hours and unlimited PTO</p>
              </div>
              <div className="benefit-card">
                <div className="benefit-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                </div>
                <h3>Growth Opportunities</h3>
                <p>Continuous learning and career development</p>
              </div>
              <div className="benefit-card">
                <div className="benefit-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <h3>Great Team</h3>
                <p>Collaborate with talented and passionate people</p>
              </div>
            </div>
          </section>

          <section className="careers-positions">
            <h2>Open Positions</h2>
            <div className="positions-list">
              {openPositions.map((position, index) => (
                <div key={index} className="position-card">
                  <div className="position-header">
                    <h3 className="position-title">{position.title}</h3>
                    <span className="position-badge">{position.department}</span>
                  </div>
                  <div className="position-details">
                    <span className="position-location">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      {position.location}
                    </span>
                    <span className="position-type">{position.type}</span>
                  </div>
                  <button className="position-apply">Apply Now</button>
                </div>
              ))}
            </div>
          </section>

          <section className="careers-cta">
            <h2>Don't See a Role That Fits?</h2>
            <p>We're always looking for talented individuals. Send us your resume and we'll keep you in mind for future opportunities.</p>
            <Link to="/contact" className="cta-button">
              Get in Touch
            </Link>
          </section>
        </div>
      </main>
      <Footer />
    </div>
    </PageLoader>
  )
}

export default Careers
