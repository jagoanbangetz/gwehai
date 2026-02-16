import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'
import Footer from '../components/Footer'
import AnimatedBackground from '../components/AnimatedBackground'
import { PLAN_TIERS, PLAN_FOOTNOTE, formatWorkersLabel } from '../config/plans'
import './Pricing.css'

const Pricing = () => {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  const handleSelectPlan = (_planId: string, priceMonthly: number) => {
    if (!isAuthenticated) {
      navigate('/signup')
    } else {
      if (priceMonthly === 0) {
        return // already on Free
      }
      // In real app: redirect to checkout or subscription page
      navigate('/dashboard')
    }
  }

  const handleEnterprise = () => {
    navigate('/contact')
  }

  return (
    <>
      <Header />
      <div className="pricing-page">
        <AnimatedBackground variant="full" intensity="medium" />
        <div className="pricing-container">
          <div className="pricing-header">
            <h1 className="pricing-title">Pricing</h1>
            <p className="pricing-subtitle">
              Choose a plan that fits your security testing and analysis needs
            </p>
            <p className="pricing-footnote">{PLAN_FOOTNOTE}</p>
          </div>

          <div className="credit-packs-grid plan-tiers-grid">
            {PLAN_TIERS.map((tier) => (
              <div key={tier.id} className={`credit-pack-card ${tier.popular ? 'popular' : ''}`}>
                {tier.popular && (
                  <div className="popular-badge">
                    <span>Most Popular</span>
                  </div>
                )}

                <div className="pack-header">
                  <div className="pack-points">
                    <span className="points-amount">{tier.name}</span>
                    <span className="points-label">{tier.id}</span>
                  </div>
                </div>

                <div className="pack-price">
                  {tier.priceMonthly === 0 ? (
                    <span className="price-amount free">Free</span>
                  ) : (
                    <>
                      <span className="price-symbol">$</span>
                      <span className="price-amount">{tier.priceMonthly}</span>
                      <span className="price-period">/mo</span>
                    </>
                  )}
                </div>

                {tier.priceMonthly > 0 && (
                  <div className="pack-value">
                    Billed monthly • Cancel anytime
                  </div>
                )}

                <ul className="pack-features-list">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="pack-feature">
                      <span className="feature-icon">✓</span>
                      <span className="feature-text">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="pack-limits">
                  <span className="limits-label">Limits:</span>
                  <span className="limits-value">
                    {formatWorkersLabel(tier.limitsSummary.workers)} • {tier.limitsSummary.scans} • {tier.limitsSummary.steps} • {tier.limitsSummary.sub_agents} sub-agent{tier.limitsSummary.sub_agents === '1' ? '' : 's'}
                  </span>
                </div>

                <button
                  className={`pack-purchase-button ${tier.priceMonthly === 0 ? 'free-button' : ''}`}
                  onClick={() => handleSelectPlan(tier.id, tier.priceMonthly)}
                >
                  {tier.priceMonthly === 0 ? 'Current Plan' : 'Get ' + tier.name}
                </button>
              </div>
            ))}
          </div>

          <div className="enterprise-section">
            <div className="enterprise-card">
              <div className="enterprise-header">
                <h2 className="enterprise-title">Enterprise</h2>
                <p className="enterprise-subtitle">Custom pricing for large organizations</p>
              </div>
              <div className="enterprise-features">
                <div className="enterprise-feature">
                  <span className="feature-icon">→</span>
                  <span>Unlimited workers &amp; scans</span>
                </div>
                <div className="enterprise-feature">
                  <span className="feature-icon">→</span>
                  <span>Volume discounts</span>
                </div>
                <div className="enterprise-feature">
                  <span className="feature-icon">→</span>
                  <span>Dedicated support</span>
                </div>
                <div className="enterprise-feature">
                  <span className="feature-icon">→</span>
                  <span>SLA guarantees</span>
                </div>
                <div className="enterprise-feature">
                  <span className="feature-icon">→</span>
                  <span>Custom integrations</span>
                </div>
              </div>
              <button
                className="enterprise-button"
                onClick={handleEnterprise}
              >
                Contact Us
              </button>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}

export default Pricing
