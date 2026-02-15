import { Link } from 'react-router-dom'
import Header from '../components/Header'
import Footer from '../components/Footer'
import AnimatedBackground from '../components/AnimatedBackground'
import './Legal.css'

const Terms = () => {
  return (
    <div className="legal-page dark-theme">
      <AnimatedBackground variant="full" intensity="low" />
      <Header />
      <main className="legal-content">
        <div className="legal-container">
          <h1 className="legal-title">Terms of Service</h1>
          <p className="legal-updated">Last updated: {new Date().toLocaleDateString()}</p>

          <section className="legal-section">
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing and using GwehAI ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.
            </p>
          </section>

          <section className="legal-section">
            <h2>2. Use License</h2>
            <p>
              Permission is granted to temporarily use GwehAI for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
            </p>
            <ul>
              <li>Modify or copy the materials</li>
              <li>Use the materials for any commercial purpose or for any public display</li>
              <li>Attempt to reverse engineer any software contained in the Service</li>
              <li>Remove any copyright or other proprietary notations from the materials</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>3. User Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account.
            </p>
          </section>

          <section className="legal-section">
            <h2>4. Service Availability</h2>
            <p>
              We reserve the right to modify, suspend, or discontinue the Service at any time without notice. We shall not be liable to you or any third party for any modification, suspension, or discontinuance of the Service.
            </p>
          </section>

          <section className="legal-section">
            <h2>5. Payment and Billing</h2>
            <p>
              If you purchase a subscription or credits, you agree to pay all charges associated with your account. All fees are non-refundable unless otherwise stated.
            </p>
          </section>

          <section className="legal-section">
            <h2>6. Prohibited Uses</h2>
            <p>You may not use the Service:</p>
            <ul>
              <li>For any unlawful purpose or to solicit others to perform unlawful acts</li>
              <li>To violate any international, federal, provincial, or state regulations, rules, laws, or local ordinances</li>
              <li>To infringe upon or violate our intellectual property rights or the intellectual property rights of others</li>
              <li>To harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate</li>
              <li>To submit false or misleading information</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>7. Limitation of Liability</h2>
            <p>
              In no event shall GwehAI, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses.
            </p>
          </section>

          <section className="legal-section">
            <h2>8. Changes to Terms</h2>
            <p>
              We reserve the right to modify these terms at any time. We will notify users of any changes by posting the new Terms of Service on this page.
            </p>
          </section>

          <section className="legal-section">
            <h2>9. Contact Information</h2>
            <p>
              If you have any questions about these Terms of Service, please contact us at{' '}
              <Link to="/contact" className="legal-link">Contact Us</Link>.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default Terms
