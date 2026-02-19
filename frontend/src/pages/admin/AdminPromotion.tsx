import { useState } from 'react'
import apiClient from '../../utils/api'
import './Admin.css'

const SEGMENTS = [
  { value: 'all', label: 'All users' },
  { value: 'FREE', label: 'FREE plan' },
  { value: 'PRO', label: 'PRO plan' },
  { value: 'PRO_PLUS', label: 'PRO_PLUS plan' },
  { value: 'ULTRA', label: 'ULTRA plan' },
]

export default function AdminPromotion() {
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [segment, setSegment] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null)

  const handleSend = async () => {
    if (!subject.trim() || !bodyHtml.trim()) {
      setError('Subject and message body are required.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await apiClient.post('/admin/promotion/send', {
        subject: subject.trim(),
        bodyHtml: bodyHtml.trim(),
        segment: segment === 'all' ? undefined : segment,
      })
      setResult(res.data)
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to send promotion emails')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h2 className="admin-page-title">Promotion</h2>
      <p className="admin-promo-desc">
        Broadcast a promotional email to users. Optionally target by plan. SMTP must be configured.
      </p>
      {error && (
        <div className="admin-notification admin-notification-error" role="alert">
          <span>{error}</span>
          <button type="button" className="admin-notification-dismiss" onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      {result && (
        <div
          className={`admin-notification ${result.sent > 0 ? 'admin-notification-success' : 'admin-notification-error'}`}
          role="alert"
        >
          <span>
            {result.sent === result.total && result.failed === 0
              ? `Success! Promotion emails sent to ${result.sent} recipient${result.sent === 1 ? '' : 's'}.`
              : result.sent > 0
                ? `Partial: ${result.sent} sent, ${result.failed} failed (${result.total} total).`
                : result.failed > 0
                  ? `Failed to send: ${result.failed} failed of ${result.total} recipients. Check SMTP configuration.`
                  : `No recipients in this segment (${result.total} total).`}
          </span>
          <button type="button" className="admin-notification-dismiss" onClick={() => setResult(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      <div className="admin-card">
        <label className="admin-modal-label">
          Segment
          <select
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            className="admin-modal-select"
          >
            {SEGMENTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="admin-modal-label">
          Subject
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="admin-modal-input"
            placeholder="Email subject"
          />
        </label>
        <label className="admin-modal-label">
          Message (HTML)
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            className="admin-promo-textarea"
            placeholder="<p>Hello!</p><p>Your promotional message here. You can use simple HTML.</p>"
            rows={10}
          />
        </label>
        <div className="admin-modal-actions" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={handleSend}
            disabled={loading || !subject.trim() || !bodyHtml.trim()}
          >
            {loading ? 'Sending…' : 'Send promotion email'}
          </button>
        </div>
      </div>
    </>
  )
}
