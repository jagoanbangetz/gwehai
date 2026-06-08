import { useNavigate } from 'react-router-dom'
import { PLAN_TIERS, formatWorkersLabel } from '../../../config/plans'

interface Props {
  onClose: () => void
  showToast: (message: string, type: 'success' | 'error' | 'info' | 'warning', duration?: number) => void
}

export default function UpgradeModal({ onClose, showToast }: Props) {
  const navigate = useNavigate()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Upgrade Plan</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="upgrade-plans-grid">
            {PLAN_TIERS.filter((t) => t.id !== 'FREE').map((tier) => (
              <div key={tier.id} className={`upgrade-plan-card ${tier.popular ? 'popular' : ''}`}>
                {tier.popular && <div className="popular-badge">Most Popular</div>}
                <div className="plan-header">
                  <h3>{tier.name}</h3>
                </div>
                <div className="plan-price">
                  <span className="price">{tier.priceMonthly === 0 ? 'Free' : `$${tier.priceMonthly}`}</span>
                  <span className="points">{tier.priceMonthly > 0 ? '/mo' : ''} {formatWorkersLabel(tier.limitsSummary.workers)} • {tier.limitsSummary.scans} • {tier.limitsSummary.steps}{tier.limitsSummary.sub_agents != null ? ` • ${tier.limitsSummary.sub_agents} sub-agent${tier.limitsSummary.sub_agents === '1' ? '' : 's'}` : ''}</span>
                </div>
                <ul className="upgrade-plan-features">
                  {tier.features.slice(0, 3).map((f, i) => <li key={i}>{f}</li>)}
                </ul>
                <button className="plan-button" onClick={() => {
                  showToast(`Redirecting to upgrade to ${tier.name}...`, 'info')
                  onClose()
                  navigate('/pricing')
                }}>
                  {tier.priceMonthly === 0 ? 'Current' : 'Get ' + tier.name}
                </button>
              </div>
            ))}
            <div className="upgrade-plan-card enterprise">
              <div className="plan-header">
                <h3>Enterprise</h3>
              </div>
              <div className="plan-price">
                <span className="price">Custom</span>
                <span className="points">Tailored to your needs</span>
              </div>
              <ul className="enterprise-features">
                <li>Volume Discounts</li>
                <li>Dedicated Support</li>
                <li>Custom Integrations</li>
              </ul>
              <button className="plan-button" onClick={() => {
                navigate('/contact')
                onClose()
              }}>
                Contact Us
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
