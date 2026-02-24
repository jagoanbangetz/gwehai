import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'
import Footer from '../components/Footer'
import AnimatedBackground from '../components/AnimatedBackground'
import { PLAN_TIERS, PLAN_FOOTNOTE, formatWorkersLabel, type PlanId } from '../config/plans'
import apiClient from '../utils/api'
import './Pricing.css'

const Pricing = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAuthenticated } = useAuth()
  const [paypalEnabled, setPaypalEnabled] = useState<boolean>(false)
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [subscriptionSuccess, setSubscriptionSuccess] = useState<boolean>(false)
  const success = searchParams.get('success') === '1'
  const cancelled = searchParams.get('cancel') === '1'
  const subscriptionIdFromUrl = searchParams.get('subscription_id') || searchParams.get('token') || ''

  // When user returns from PayPal approval: complete subscription (upgrade plan) then clear URL params and show success
  useEffect(() => {
    if (!success || !subscriptionIdFromUrl || !isAuthenticated) return
    apiClient
      .post('/subscriptions/complete', {
        subscription_id: subscriptionIdFromUrl,
        token: subscriptionIdFromUrl,
      })
      .then(() => {
        setSubscriptionSuccess(true)
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev)
          next.delete('success')
          next.delete('subscription_id')
          next.delete('token')
          return next
        })
      })
      .catch(() => {})
  }, [success, subscriptionIdFromUrl, isAuthenticated])

  // Clear cancel param when user cancelled on PayPal
  useEffect(() => {
    if (cancelled) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('cancel')
        return next
      })
    }
  }, [cancelled])

  useEffect(() => {
    if (!isAuthenticated) return
    apiClient.get('/subscriptions/me').then((res) => {
      setPaypalEnabled(!!res.data?.paypalEnabled)
    }).catch(() => {})
  }, [isAuthenticated])

  const handleSelectPlan = async (planId: string, priceMonthly: number) => {
    if (!isAuthenticated) {
      navigate('/signup')
      return
    }
    if (priceMonthly === 0) {
      return
    }
    if (!paypalEnabled) {
      navigate('/dashboard')
      return
    }
    setError(null)
    setLoadingPlanId(planId)
    try {
      const base = window.location.origin
      const returnUrl = `${base}/pricing?success=1`
      const cancelUrl = `${base}/pricing?cancel=1`
      const { data } = await apiClient.post<{ ok: boolean; approvalUrl?: string; message?: string }>('/subscriptions/create', {
        planId: planId as PlanId,
        returnUrl,
        cancelUrl,
      })
      if (data.ok && data.approvalUrl) {
        window.location.href = data.approvalUrl
        return
      }
      setError(data.message || 'Could not start subscription')
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Something went wrong')
    } finally {
      setLoadingPlanId(null)
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
            {(success || subscriptionSuccess) && (
              <div className="pricing-message success" role="alert">
                Subscription successful. Your plan has been upgraded. You can use all features now—check your email for confirmation.
              </div>
            )}
            {cancelled && (
              <div className="pricing-message cancelled" role="alert">
                Subscription was cancelled. You can try again anytime.
              </div>
            )}
            {error && (
              <div className="pricing-message error" role="alert">
                {error}
              </div>
            )}
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
                  disabled={tier.priceMonthly > 0 && loadingPlanId === tier.id}
                >
                  {tier.priceMonthly === 0
                    ? 'Current Plan'
                    : loadingPlanId === tier.id
                      ? 'Redirecting…'
                      : paypalEnabled
                        ? 'Subscribe with PayPal'
                        : 'Get ' + tier.name}
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
