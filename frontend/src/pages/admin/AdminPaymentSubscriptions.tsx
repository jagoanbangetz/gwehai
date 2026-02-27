import { useState, useEffect } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

interface SubscriptionRow {
  id: string
  userId: string
  userEmail: string | null
  plan: string
  status: string
  providerSubscriptionId: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  createdAt: string
}

/** Format ISO date string for display (e.g. "Jan 15, 2024, 3:45 PM") */
function formatTransactionDate(iso: string | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return String(iso)
  }
}

/** Format period range for display (e.g. "Jan 15 – Feb 14, 2024") */
function formatPeriod(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  try {
    const s = new Date(start)
    const e = new Date(end)
    return `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
  } catch {
    return '—'
  }
}

/** Get amount string from transaction (amount.value + amount.currency_code or similar) */
function formatAmount(tx: Record<string, unknown>): string {
  const amt = tx.amount as Record<string, unknown> | undefined
  if (amt && typeof amt.value === 'string') {
    const cur = (amt.currency_code as string) || 'USD'
    return `${amt.value} ${cur}`
  }
  if (tx.total_amount) {
    const t = tx.total_amount as Record<string, unknown>
    if (t && typeof t.value === 'string') return `${t.value} ${(t.currency_code as string) || 'USD'}`
  }
  return '—'
}

/** Today in YYYY-MM-DD for date inputs and default range */
function todayYYYYMMDD(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Turn YYYY-MM-DD into ISO for API: start = 00:00:00Z, end = 23:59:59Z */
function toStartTime(dateStr: string): string {
  return `${dateStr}T00:00:00Z`
}
function toEndTime(dateStr: string): string {
  return `${dateStr}T23:59:59Z`
}

export default function AdminPaymentSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([])
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(true)
  const [subId, setSubId] = useState('')
  const [subReason, setSubReason] = useState('')
  const [txSubId, setTxSubId] = useState('')
  const [txStart, setTxStart] = useState(() => todayYYYYMMDD())
  const [txEnd, setTxEnd] = useState(() => todayYYYYMMDD())
  const [txResult, setTxResult] = useState<Record<string, unknown>[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  /** Modal: { action, paypalId }. paypalId = row action; null = form (use subId) */
  const [confirmModal, setConfirmModal] = useState<{ action: 'suspend' | 'cancel'; paypalId: string | null } | null>(null)

  const loadSubscriptions = async () => {
    try {
      setSubscriptionsLoading(true)
      const res = await apiClient.get<{ subscriptions: SubscriptionRow[] }>('/admin/subscriptions')
      setSubscriptions(res.data.subscriptions)
    } catch {
      setSubscriptions([])
    } finally {
      setSubscriptionsLoading(false)
    }
  }

  useEffect(() => {
    loadSubscriptions()
  }, [])

  const openConfirmModal = (action: 'suspend' | 'cancel', paypalId: string | null) => {
    setConfirmModal({ action, paypalId })
  }

  const closeConfirmModal = () => {
    if (!actionLoading && !actionLoadingId) setConfirmModal(null)
  }

  const runConfirmedAction = async () => {
    if (!confirmModal) return
    const { action, paypalId } = confirmModal
    const subscriptionId = paypalId ?? subId.trim()
    if (!subscriptionId) return
    const key = paypalId ? `${paypalId}-${action}` : action
    const successMsg = action === 'suspend' ? 'Subscription suspended.' : 'Subscription cancelled.'
    try {
      if (paypalId) setActionLoadingId(key)
      else setActionLoading(key)
      setError(null)
      setMessage(null)
      const endpoint = action === 'suspend' ? '/admin/paypal/subscription/suspend' : '/admin/paypal/subscription/cancel'
      await apiClient.post(endpoint, { subscriptionId, reason: subReason.trim() || undefined })
      setMessage(successMsg)
      setConfirmModal(null)
      await loadSubscriptions()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Action failed')
    } finally {
      if (paypalId) setActionLoadingId(null)
      else setActionLoading(null)
    }
  }

  const runRowAction = (paypalId: string, action: 'suspend' | 'cancel') => {
    openConfirmModal(action, paypalId)
  }

  const handleSuspend = () => openConfirmModal('suspend', null)
  const handleCancel = () => openConfirmModal('cancel', null)
  const handleListTransactions = async () => {
    try {
      setActionLoading('transactions')
      setError(null)
      setMessage(null)
      const params = new URLSearchParams({ subscriptionId: txSubId.trim() })
      if (txStart.trim()) params.set('start_time', toStartTime(txStart.trim()))
      if (txEnd.trim()) params.set('end_time', toEndTime(txEnd.trim()))
      const res = await apiClient.get<{ transactions: Array<Record<string, unknown>> }>(
        `/admin/paypal/subscription/transactions?${params.toString()}`,
      )
      setTxResult(res.data.transactions)
      setMessage(`Found ${res.data.transactions.length} transaction(s).`)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Failed to list transactions')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <>
      <h2 className="admin-page-title">PayPal subscriptions</h2>
      <p className="admin-billing-intro">
        Pause or cancel a subscription, or view its payment history in a table.
      </p>
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
        <h3 className="admin-billing-heading">Subscriptions</h3>
        <p className="admin-billing-help">
          Subscriptions created in your app. Use <strong>Suspend</strong> to pause billing (customer can resume later) or <strong>Cancel</strong> to end the subscription.
        </p>
        {subscriptionsLoading ? (
          <p className="admin-billing-help">Loading subscriptions…</p>
        ) : subscriptions.length === 0 ? (
          <p className="admin-billing-help">No subscriptions yet. They appear here after users subscribe via PayPal.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-payment-subs-table" aria-label="Subscriptions">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>PayPal ID</th>
                  <th>Current period</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((row) => (
                  <tr key={row.id}>
                    <td>{row.userEmail ?? <span className="admin-muted">—</span>}</td>
                    <td><span className="admin-payment-plan">{row.plan}</span></td>
                    <td>
                      <span className="admin-payment-status">{row.status}</span>
                    </td>
                    <td className="admin-payment-tx-id">
                      {row.providerSubscriptionId ? (
                        <code className="admin-payment-tx-code">{row.providerSubscriptionId}</code>
                      ) : (
                        <span className="admin-muted">—</span>
                      )}
                    </td>
                    <td>{formatPeriod(row.currentPeriodStart, row.currentPeriodEnd)}</td>
                    <td>
                      <div className="admin-user-actions">
                        {row.providerSubscriptionId && (
                          <>
                            <button
                              type="button"
                              className="admin-btn admin-btn-secondary admin-btn-sm"
                              disabled={!!actionLoadingId}
                              onClick={() => runRowAction(row.providerSubscriptionId!, 'suspend')}
                            >
                              {actionLoadingId === `${row.providerSubscriptionId}-suspend` ? '…' : 'Suspend'}
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn-secondary admin-btn-sm"
                              disabled={!!actionLoadingId}
                              onClick={() => runRowAction(row.providerSubscriptionId!, 'cancel')}
                            >
                              {actionLoadingId === `${row.providerSubscriptionId}-cancel` ? '…' : 'Cancel'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirmModal && (
        <div className="admin-modal-backdrop" onClick={closeConfirmModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">
                {confirmModal.action === 'suspend' ? 'Suspend subscription' : 'Cancel subscription'}
              </h3>
            </div>
            <div className="admin-modal-body">
              <p className="admin-modal-subtitle" style={{ margin: '0 0 1rem 0' }}>
                {confirmModal.action === 'suspend' ? (
                  confirmModal.paypalId ? (
                    <>Pause subscription <code className="admin-payment-tx-code">{confirmModal.paypalId}</code>? Billing will be paused; the customer can resume later.</>
                  ) : (
                    'Pause this subscription? Billing will be paused; the customer can resume later.'
                  )
                ) : confirmModal.paypalId ? (
                  <>Cancel subscription <code className="admin-payment-tx-code">{confirmModal.paypalId}</code>? The user will be moved to the Free plan. This cannot be undone.</>
                ) : (
                  'Cancel this subscription? The user will be moved to the Free plan. This cannot be undone.'
                )}
              </p>
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  disabled={!!actionLoading || !!actionLoadingId}
                  onClick={runConfirmedAction}
                >
                  {actionLoading || actionLoadingId ? '…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary"
                  disabled={!!actionLoading || !!actionLoadingId}
                  onClick={closeConfirmModal}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="admin-card admin-billing-section">
        <h3 className="admin-billing-heading">Pause or cancel by ID</h3>
        <p className="admin-billing-help">
          If the subscription is not in the table above (e.g. created outside this app), enter the PayPal subscription ID and reason below.
        </p>
        <div className="admin-payment-form-grid">
          <label className="admin-modal-label">
            Subscription ID
            <input
              type="text"
              className="admin-modal-input"
              value={subId}
              onChange={(e) => setSubId(e.target.value)}
              placeholder="e.g. I-xxx (from PayPal)"
            />
          </label>
          <label className="admin-modal-label">
            Reason (optional)
            <input
              type="text"
              className="admin-modal-input"
              value={subReason}
              onChange={(e) => setSubReason(e.target.value)}
              placeholder="e.g. Customer request"
            />
          </label>
        </div>
        <div className="admin-billing-action-buttons">
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            disabled={!subId.trim() || !!actionLoading}
            onClick={handleSuspend}
          >
            {actionLoading === 'suspend' ? '…' : 'Suspend'}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            disabled={!subId.trim() || !!actionLoading}
            onClick={handleCancel}
          >
            {actionLoading === 'cancel' ? '…' : 'Cancel'}
          </button>
        </div>
      </section>

      <section className="admin-card admin-billing-section admin-payment-history-section">
        <h3 className="admin-billing-heading">Payment history</h3>
        <p className="admin-billing-help">
          Enter the subscription ID and pick a date range. Defaults to today. Results appear in the table below.
        </p>
        <div className="admin-payment-history-filters">
          <div className="admin-payment-history-field">
            <label className="admin-payment-history-label" htmlFor="payment-history-sub-id">
              Subscription ID
            </label>
            <input
              id="payment-history-sub-id"
              type="text"
              className="admin-modal-input admin-payment-history-input"
              value={txSubId}
              onChange={(e) => setTxSubId(e.target.value)}
              placeholder="e.g. I-xxx"
            />
          </div>
          <div className="admin-payment-history-field">
            <label className="admin-payment-history-label" htmlFor="payment-history-from">
              From date
            </label>
            <input
              id="payment-history-from"
              type="date"
              className="admin-modal-input admin-date-input admin-payment-history-date"
              value={txStart}
              onChange={(e) => setTxStart(e.target.value)}
              title="Start of range"
            />
          </div>
          <div className="admin-payment-history-field">
            <label className="admin-payment-history-label" htmlFor="payment-history-to">
              To date
            </label>
            <input
              id="payment-history-to"
              type="date"
              className="admin-modal-input admin-date-input admin-payment-history-date"
              value={txEnd}
              onChange={(e) => setTxEnd(e.target.value)}
              title="End of range"
            />
          </div>
          <div className="admin-payment-history-field admin-payment-history-actions">
            <button
              type="button"
              className="admin-btn admin-btn-primary"
              disabled={!txSubId.trim() || !!actionLoading}
              onClick={handleListTransactions}
            >
              {actionLoading === 'transactions' ? 'Loading…' : 'Load transactions'}
            </button>
          </div>
        </div>

        {txResult !== null && (
          <div className="admin-payment-tx-result">
            <h4 className="admin-billing-subheading">
              {txResult.length === 0 ? 'No transactions found' : `${txResult.length} transaction${txResult.length === 1 ? '' : 's'}`}
            </h4>
            {txResult.length === 0 ? (
              <p className="admin-billing-help">No payments in this range for this subscription.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table admin-payment-tx-table" aria-label="Subscription transactions">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Type</th>
                      <th className="admin-payment-tx-id">Transaction ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txResult.map((tx, idx) => (
                      <tr key={(tx.id as string) ?? idx}>
                        <td>{formatTransactionDate((tx.time ?? tx.date ?? tx.created_at) as string)}</td>
                        <td>{formatAmount(tx)}</td>
                        <td>
                          <span className="admin-payment-status">
                            {String(tx.status ?? tx.state ?? '—')}
                          </span>
                        </td>
                        <td>{String(tx.type ?? tx.transaction_type ?? '—')}</td>
                        <td className="admin-payment-tx-id">
                          <code className="admin-payment-tx-code">{(tx.id ?? tx.transaction_id) as string || '—'}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  )
}
