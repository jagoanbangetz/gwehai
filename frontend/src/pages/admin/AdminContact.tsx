import { useState, useEffect, useCallback } from 'react'
import { ToastContainer, type Toast } from '../../components/Toast'
import apiClient from '../../utils/api'
import './AdminContact.css'

/* ── Types ── */
interface ContactMessage {
  id: string
  name: string
  email: string
  subject: string
  message: string
  status: 'read' | 'unread'
  created_at: string
}

interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

const SUBJECT_LABELS: Record<string, string> = {
  support: 'Technical Support',
  billing: 'Billing Question',
  feature: 'Feature Request',
  bug: 'Report a Bug',
  partnership: 'Partnership',
  other: 'Other',
}

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

/* ── Component ── */
export default function AdminContact() {
  const [messages, setMessages] = useState<ContactMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1, limit: 20, total: 0, totalPages: 1,
  })
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    setToasts((prev) => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  /* ── Fetch ── */
  const fetchMessages = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const res = await apiClient.get('/contact', { params: { page, limit: 20 } })
      setMessages(res.data.data ?? res.data.messages ?? [])
      if (res.data.pagination) {
        setPagination(res.data.pagination)
      } else {
        setPagination((p) => ({ ...p, page, total: res.data.total ?? 0 }))
      }
    } catch {
      addToast('Failed to load messages', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { fetchMessages(1) }, [fetchMessages])

  /* ── Mark as read ── */
  const markAsRead = async (id: string) => {
    try {
      await apiClient.patch(`/contact/${id}/read`)
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: 'read' } : m))
      )
    } catch {
      addToast('Failed to mark as read', 'error')
    }
  }

  /* ── Toggle expand ── */
  const toggleExpand = (msg: ContactMessage) => {
    const isExpanding = expandedId !== msg.id
    setExpandedId(isExpanding ? msg.id : null)
    if (isExpanding && msg.status === 'unread') {
      markAsRead(msg.id)
    }
  }

  /* ── Unread count ── */
  const unreadCount = messages.filter((m) => m.status === 'unread').length

  return (
    <div className="admin-contact">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Page header */}
      <div className="ac-header">
        <div className="ac-header-left">
          <h1 className="admin-page-title">
            <i className="fa-solid fa-inbox" /> Contact Inbox
          </h1>
          {unreadCount > 0 && (
            <span className="ac-unread-badge">{unreadCount} unread</span>
          )}
        </div>
        <button className="ac-refresh-btn" onClick={() => fetchMessages(pagination.page)} disabled={loading}>
          <i className={`fa-solid fa-rotate ${loading ? 'fa-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="ac-table-wrap admin-card">
        {loading && messages.length === 0 ? (
          <div className="ac-empty">
            <span className="ac-empty-spinner" />
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="ac-empty">
            <i className="fa-solid fa-inbox" />
            <p>No contact messages yet</p>
          </div>
        ) : (
          <table className="ac-table">
            <thead>
              <tr>
                <th className="ac-col-status" />
                <th>Name</th>
                <th>Email</th>
                <th>Subject</th>
                <th className="ac-col-date">Date</th>
                <th className="ac-col-actions" />
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => {
                const isOpen = expandedId === msg.id
                return (
                  <tr
                    key={msg.id}
                    className={`ac-row ${msg.status === 'unread' ? 'ac-row-unread' : ''} ${isOpen ? 'ac-row-open' : ''}`}
                    onClick={() => toggleExpand(msg)}
                  >
                    {/* Status dot */}
                    <td className="ac-col-status">
                      <span className={`ac-dot ${msg.status === 'unread' ? 'ac-dot-unread' : ''}`} />
                    </td>

                    {/* Name */}
                    <td>
                      <span className="ac-name">{msg.name}</span>
                    </td>

                    {/* Email */}
                    <td>
                      <span className="ac-email">{msg.email}</span>
                    </td>

                    {/* Subject */}
                    <td>
                      <span className="ac-subject-tag">
                        {SUBJECT_LABELS[msg.subject] || msg.subject}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="ac-col-date">
                      <span className="ac-date">{fmtDate(msg.created_at)}</span>
                      <span className="ac-time">{fmtTime(msg.created_at)}</span>
                    </td>

                    {/* Actions */}
                    <td className="ac-col-actions">
                      {msg.status === 'unread' && (
                        <button
                          className="ac-mark-read-btn"
                          title="Mark as read"
                          onClick={(e) => { e.stopPropagation(); markAsRead(msg.id) }}
                        >
                          <i className="fa-solid fa-check" />
                        </button>
                      )}
                      <span className={`ac-chevron ${isOpen ? 'ac-chevron-open' : ''}`}>
                        <i className="fa-solid fa-chevron-down" />
                      </span>
                    </td>
                  </tr>
                )
              })}

              {/* Expanded detail rows */}
              {messages.map((msg) => {
                if (expandedId !== msg.id) return null
                return (
                  <tr key={`${msg.id}-detail`} className="ac-detail-row">
                    <td colSpan={6}>
                      <div className="ac-detail">
                        <div className="ac-detail-header">
                          <div className="ac-detail-from">
                            <i className="fa-solid fa-user-circle" />
                            <strong>{msg.name}</strong>
                            <span className="ac-detail-email">&lt;{msg.email}&gt;</span>
                          </div>
                          <div className="ac-detail-meta">
                            <span className="ac-detail-subject-tag">
                              {SUBJECT_LABELS[msg.subject] || msg.subject}
                            </span>
                            <span className="ac-detail-date">
                              {fmtDate(msg.created_at)} at {fmtTime(msg.created_at)}
                            </span>
                          </div>
                        </div>
                        <div className="ac-detail-message">
                          {msg.message}
                        </div>
                        <div className="ac-detail-actions">
                          <a
                            href={`mailto:${msg.email}?subject=Re: ${SUBJECT_LABELS[msg.subject] || msg.subject}`}
                            className="ac-reply-btn"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <i className="fa-solid fa-reply" /> Reply via Email
                          </a>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="ac-pagination">
          <button
            className="ac-page-btn"
            disabled={pagination.page <= 1 || loading}
            onClick={() => fetchMessages(pagination.page - 1)}
          >
            <i className="fa-solid fa-chevron-left" /> Prev
          </button>
          <span className="ac-page-info">
            Page {pagination.page} of {pagination.totalPages}
            <span className="ac-page-total">({pagination.total} messages)</span>
          </span>
          <button
            className="ac-page-btn"
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => fetchMessages(pagination.page + 1)}
          >
            Next <i className="fa-solid fa-chevron-right" />
          </button>
        </div>
      )}
    </div>
  )
}
