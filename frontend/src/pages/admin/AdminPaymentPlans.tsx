import { useState } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

export default function AdminPaymentPlans() {
  const [planId, setPlanId] = useState('')
  const [planPriceValue, setPlanPriceValue] = useState('')
  const [planPriceSeq, setPlanPriceSeq] = useState(1)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const runAction = async (
    key: string,
    fn: () => Promise<unknown>,
    successMsg: string,
  ) => {
    try {
      setActionLoading(key)
      setError(null)
      setMessage(null)
      await fn()
      setMessage(successMsg)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Action failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleUpdatePricing = () =>
    runAction(
      'updatePricing',
      () =>
        apiClient.post('/admin/paypal/plan/update-pricing', {
          planId: planId.trim(),
          pricingSchemes: [
            {
              billing_cycle_sequence: planPriceSeq,
              pricing_scheme: {
                fixed_price: { value: planPriceValue.trim(), currency_code: 'USD' },
              },
            },
          ],
        }),
      'Plan pricing updated.',
    )
  const handleDeactivatePlan = () =>
    runAction(
      'deactivate',
      () => apiClient.post('/admin/paypal/plan/deactivate', { planId: planId.trim() }),
      'Plan deactivated.',
    )
  const handleActivatePlan = () =>
    runAction(
      'activate',
      () => apiClient.post('/admin/paypal/plan/activate', { planId: planId.trim() }),
      'Plan activated.',
    )

  return (
    <>
      <h2 className="admin-page-title">PayPal plan actions</h2>
      {message && (
        <div className="admin-notification admin-notification-success" role="alert">
          <span>{message}</span>
          <button type="button" className="admin-notification-dismiss" onClick={() => setMessage(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      {error && (
        <div className="admin-notification admin-notification-error" role="alert">
          <span>{error}</span>
          <button type="button" className="admin-notification-dismiss" onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <section className="admin-card admin-billing-section">
        <h3 className="admin-billing-heading">Update pricing, activate, or deactivate</h3>
        <p className="admin-billing-help">
          Use plan IDs from <strong>Billing & pricing</strong>. Deactivate stops new subscriptions; activate allows them again.
        </p>
        <label className="admin-modal-label">
          Plan ID
          <input
            type="text"
            className="admin-modal-input"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            placeholder="P-xxx (e.g. from Billing page)"
          />
        </label>
        <label className="admin-modal-label">
          Billing cycle sequence (for pricing update)
          <input
            type="number"
            min={1}
            className="admin-modal-input"
            value={planPriceSeq}
            onChange={(e) => setPlanPriceSeq(Number(e.target.value) || 1)}
          />
        </label>
        <label className="admin-modal-label">
          New price value USD (for update pricing only)
          <input
            type="text"
            className="admin-modal-input"
            value={planPriceValue}
            onChange={(e) => setPlanPriceValue(e.target.value)}
            placeholder="e.g. 29"
          />
        </label>
        <div className="admin-billing-action-buttons">
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            disabled={!planId.trim() || !planPriceValue.trim() || !!actionLoading}
            onClick={handleUpdatePricing}
          >
            {actionLoading === 'updatePricing' ? '…' : 'Update pricing'}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            disabled={!planId.trim() || !!actionLoading}
            onClick={handleDeactivatePlan}
          >
            {actionLoading === 'deactivate' ? '…' : 'Deactivate plan'}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            disabled={!planId.trim() || !!actionLoading}
            onClick={handleActivatePlan}
          >
            {actionLoading === 'activate' ? '…' : 'Activate plan'}
          </button>
        </div>
      </section>
    </>
  )
}
