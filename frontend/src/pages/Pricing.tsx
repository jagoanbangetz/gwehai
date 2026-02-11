import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'
import Footer from '../components/Footer'
import AnimatedBackground from '../components/AnimatedBackground'
import './Pricing.css'
import PageLoader from '../components/PageLoader'

interface CreditPack {
  points: number
  price: number
  savings?: string
  popular?: boolean
  free?: boolean
}

const Pricing = () => {
  const { isAuthenticated } = useAuth()

  const creditPacks: CreditPack[] = [
    {
      points: 10,
      price: 0,
      free: true,
    },
    {
      points: 100,
      price: 20,
    },
    {
      points: 200,
      price: 35,
      savings: 'Save $5',
    },
    {
      points: 500,
      price: 70,
      savings: 'Save $30',
      popular: true,
    },
    {
      points: 600,
      price: 100,
      savings: 'Save $20',
    },
  ]

  const handlePurchase = (points: number, price: number, isFree: boolean = false) => {
    if (!isAuthenticated) {
      window.location.href = '/signup'
    } else {
      if (isFree) {
        // In real app, this would grant free points via API
        alert(`Claiming ${points} free points...`)
      } else {
        // In real app, this would redirect to payment page
        alert(`Redirecting to purchase ${points} points for $${price}...`)
      }
    }
  }

  const handleEnterprise = () => {
    window.location.href = '/contact'
  }

  return (
    <PageLoader>
    <>
      <Header />
      <div className="pricing-page">
        <AnimatedBackground variant="full" intensity="medium" />
        <div className="pricing-container">
          <div className="pricing-header">
            <h1 className="pricing-title">Pricing</h1>
            <p className="pricing-subtitle">
              Purchase credits to use GwehAI for security testing and analysis
            </p>
          </div>

          <div className="credit-packs-grid">
            {creditPacks.map((pack, index) => (
              <div key={index} className={`credit-pack-card ${pack.popular ? 'popular' : ''}`}>
                {pack.popular && (
                  <div className="popular-badge">
                    <span>Most Popular</span>
                  </div>
                )}
                
                <div className="pack-header">
                  <div className="pack-points">
                    <span className="points-amount">{pack.points}</span>
                    <span className="points-label">Points</span>
                  </div>
                  {pack.savings && (
                    <div className="pack-savings">{pack.savings}</div>
                  )}
                </div>

                <div className="pack-price">
                  {pack.free ? (
                    <span className="price-amount free">Free</span>
                  ) : (
                    <>
                      <span className="price-symbol">$</span>
                      <span className="price-amount">{pack.price}</span>
                    </>
                  )}
                </div>

                {!pack.free && (
                  <div className="pack-value">
                    ${(pack.price / pack.points).toFixed(2)} per point
                  </div>
                )}

                <button
                  className={`pack-purchase-button ${pack.free ? 'free-button' : ''}`}
                  onClick={() => handlePurchase(pack.points, pack.price, pack.free)}
                >
                  {pack.free ? 'Get Free Points' : 'Purchase'}
                </button>

                <div className="pack-features">
                  <div className="pack-feature">
                    <span className="feature-icon">✓</span>
                    <span className="feature-text">Use for AI chat messages</span>
                  </div>
                  <div className="pack-feature">
                    <span className="feature-icon">✓</span>
                    <span className="feature-text">Use for security analysis</span>
                  </div>
                  <div className="pack-feature">
                    <span className="feature-icon">✓</span>
                    <span className="feature-text">No expiration date</span>
                  </div>
                </div>
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
                  <span>Custom point packages</span>
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
    </PageLoader>
  )
}

export default Pricing
