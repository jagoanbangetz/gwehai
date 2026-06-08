import { formatWorkersLabel } from '../../../config/plans'
import type { CurrentPlan, MyPlanResponse } from '../types'

interface Props {
  isLoading: boolean
  myPlan: MyPlanResponse | null
  currentPlan: CurrentPlan | null
  onUpgrade: () => void
  onClose: () => void
}

export default function PlanModal({ isLoading, myPlan, currentPlan, onUpgrade, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content plan-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">My Plan & Usage</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="plan-info-section">
            <h3 className="plan-section-title">Current Plan</h3>
            {isLoading ? (
              <div className="plan-card">
                <div className="plan-loading">Loading plan...</div>
              </div>
            ) : myPlan ? (
              <div className="plan-card">
                <div className="plan-card-header">
                  <span className="plan-name">{myPlan.plan.marketing_title}</span>
                  <span className="plan-badge">{myPlan.planId}</span>
                </div>
                <div className="plan-details">
                  <div className="plan-detail-item">
                    <span className="detail-label">Limits:</span>
                    <span className="detail-value">
                      {formatWorkersLabel(myPlan.limits_summary.workers)} • {myPlan.limits_summary.scans} • {myPlan.limits_summary.steps}{myPlan.limits_summary.sub_agents != null ? ` • ${myPlan.limits_summary.sub_agents} sub-agent${myPlan.limits_summary.sub_agents === '1' ? '' : 's'}` : ''}
                    </span>
                  </div>
                  <div className="plan-detail-item plan-limits-explainer">
                    <span className="detail-label">What this means:</span>
                    <span className="detail-value">
                      <strong>Workers</strong> = concurrent pentest targets; <strong>Scans</strong> = scan runs; <strong>Steps</strong> = AI actions per scan; <strong>Sub-agents</strong> = parallel AI workers. <strong>Unlimited*</strong> = no fixed cap; usage is subject to a fair usage policy so the service stays fast and reliable for everyone.
                    </span>
                  </div>
                  <div className="plan-detail-item">
                    <span className="detail-label">Note:</span>
                    <span className="detail-value">{myPlan.plan.marketing_footnote}</span>
                  </div>
                </div>
              </div>
            ) : !currentPlan ? (
              <div className="plan-card">
                <div className="plan-card-header">
                  <span className="plan-name">Free</span>
                </div>
                <div className="plan-details">
                  <div className="plan-detail-item">
                    <span className="detail-label">Status:</span>
                    <span className="detail-value">You are on the free tier.</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="plan-card">
                <div className="plan-card-header">
                  <span className="plan-name">{currentPlan.plan?.name || currentPlan.plan?.code || 'Custom Plan'}</span>
                  <span className="plan-badge">{currentPlan.status.toUpperCase()}</span>
                </div>
                <div className="plan-details">
                  <div className="plan-detail-item">
                    <span className="detail-label">Points:</span>
                    <span className="detail-value">{currentPlan.pointsGranted} total</span>
                  </div>
                  <div className="plan-detail-item">
                    <span className="detail-label">Price:</span>
                    <span className="detail-value">
                      {currentPlan.plan?.monthlyPriceUsd != null ? `$${currentPlan.plan.monthlyPriceUsd}` : 'Custom'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="usage-section">
            <h3 className="plan-section-title">Usage</h3>
            <div className="usage-stats">
              {myPlan?.usage ? (
                <>
                  <div className="usage-stat-card">
                    <div className="stat-label">Credit</div>
                    <div className="stat-value">
                      {myPlan.usage.day.tokens_used}
                      {myPlan.usage.day.tokens_remaining != null ? ` / ${myPlan.usage.day.tokens_used + myPlan.usage.day.tokens_remaining}` : ''}
                    </div>
                  </div>
                </>
              ) : null}
              {currentPlan && (
                <>
                  <div className="usage-stat-card">
                    <div className="stat-label">Messages</div>
                    <div className="stat-value">{currentPlan.messagesSent}</div>
                  </div>
                  <div className="usage-stat-card">
                    <div className="stat-label">Reports</div>
                    <div className="stat-value">{currentPlan.reportsGenerated}</div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="plan-actions">
            <button className="upgrade-plan-button" onClick={onUpgrade}>
              Upgrade Plan
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
