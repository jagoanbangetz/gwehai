import { useState, useCallback } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import AnimatedBackground from '../components/AnimatedBackground'
import { ToastContainer, type Toast } from '../components/Toast'
import apiClient from '../utils/api'
import './Contact.css'

interface FormData {
  name: string
  email: string
  subject: string
  message: string
}

interface FormErrors {
  name?: string
  email?: string
  subject?: string
  message?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const validate = (data: FormData): FormErrors => {
  const errors: FormErrors = {}
  if (!data.name.trim()) errors.name = 'Name is required'
  if (!data.email.trim()) errors.email = 'Email is required'
  else if (!EMAIL_RE.test(data.email)) errors.email = 'Please enter a valid email'
  if (!data.subject) errors.subject = 'Please select a subject'
  if (!data.message.trim()) errors.message = 'Message is required'
  else if (data.message.trim().length < 10) errors.message = 'Message must be at least 10 characters'
  return errors
}

const SUBJECTS = [
  { value: '', label: 'Select a subject' },
  { value: 'support', label: 'Technical Support' },
  { value: 'billing', label: 'Billing Question' },
  { value: 'feature', label: 'Feature Request' },
  { value: 'bug', label: 'Report a Bug' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'other', label: 'Other' },
]

const Contact = () => {
  const [formData, setFormData] = useState<FormData>({
    name: '', email: '', subject: '', message: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: Toast['type'] = 'info', duration = 4000) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    setToasts((prev) => [...prev, { id, message, type, duration }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    // Clear error on change
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  const handleBlur = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name } = e.target
    setTouched((prev) => ({ ...prev, [name]: true }))
    // Validate single field on blur
    const fieldErrors = validate(formData)
    setErrors((prev) => ({ ...prev, [name]: fieldErrors[name as keyof FormErrors] }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ name: true, email: true, subject: true, message: true })

    const validationErrors = validate(formData)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    setIsSubmitting(true)
    try {
      await apiClient.post('/contact', {
        name: formData.name.trim(),
        email: formData.email.trim(),
        subject: formData.subject,
        message: formData.message.trim(),
      })
      addToast('Message sent successfully! We\'ll get back to you soon.', 'success', 5000)
      setFormData({ name: '', email: '', subject: '', message: '' })
      setTouched({})
      setErrors({})
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response: { status: number; data?: { message?: string } } }
        const status = axiosErr.response.status
        if (status === 429) {
          addToast('Too many requests. Please wait a moment and try again.', 'warning', 6000)
        } else {
          addToast(
            axiosErr.response.data?.message || 'Failed to send message. Please try again.',
            'error'
          )
        }
      } else {
        addToast('Network error. Please check your connection and try again.', 'error')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const getFieldClass = (field: keyof FormErrors) => {
    if (touched[field] && errors[field]) return 'form-input form-input-error'
    if (touched[field] && !errors[field] && formData[field]) return 'form-input form-input-valid'
    return 'form-input'
  }

  return (
    <div className="contact-page dark-theme">
      <AnimatedBackground variant="full" intensity="low" />
      <Header />
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <main className="contact-content">
        <div className="contact-container">
          {/* Hero header */}
          <div className="contact-header">
            <div className="contact-header-icon">
              <i className="fa-solid fa-paper-plane" />
            </div>
            <h1 className="contact-title">Get in Touch</h1>
            <p className="contact-subtitle">
              Have questions about GwehAI? We&apos;d love to hear from you.
              Send us a message and our security team will respond within 24 hours.
            </p>
          </div>

          <div className="contact-grid">
            {/* Left: info cards */}
            <div className="contact-info">
              <div className="info-card">
                <div className="info-icon">
                  <i className="fa-solid fa-envelope" />
                </div>
                <div>
                  <h3>Email</h3>
                  <p>support@gwehai.ai</p>
                </div>
              </div>

              <div className="info-card">
                <div className="info-icon">
                  <i className="fa-solid fa-clock" />
                </div>
                <div>
                  <h3>Response Time</h3>
                  <p>Within 24 hours</p>
                </div>
              </div>

              <div className="info-card">
                <div className="info-icon">
                  <i className="fa-solid fa-shield-halved" />
                </div>
                <div>
                  <h3>Security</h3>
                  <p>Report vulnerabilities<br />to security@gwehai.ai</p>
                </div>
              </div>

              <div className="info-card">
                <div className="info-icon">
                  <i className="fa-solid fa-comments" />
                </div>
                <div>
                  <h3>Live Chat</h3>
                  <p>Available for Pro users<br />inside the dashboard</p>
                </div>
              </div>
            </div>

            {/* Right: form */}
            <form className="contact-form" onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="contact-name">
                  <i className="fa-solid fa-user" /> Name
                </label>
                <input
                  type="text"
                  id="contact-name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="Your full name"
                  className={getFieldClass('name')}
                  autoComplete="name"
                />
                {touched.name && errors.name && (
                  <span className="field-error"><i className="fa-solid fa-circle-exclamation" /> {errors.name}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="contact-email">
                  <i className="fa-solid fa-at" /> Email
                </label>
                <input
                  type="email"
                  id="contact-email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="you@company.com"
                  className={getFieldClass('email')}
                  autoComplete="email"
                />
                {touched.email && errors.email && (
                  <span className="field-error"><i className="fa-solid fa-circle-exclamation" /> {errors.email}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="contact-subject">
                  <i className="fa-solid fa-tag" /> Subject
                </label>
                <select
                  id="contact-subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={getFieldClass('subject')}
                >
                  {SUBJECTS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                {touched.subject && errors.subject && (
                  <span className="field-error"><i className="fa-solid fa-circle-exclamation" /> {errors.subject}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="contact-message">
                  <i className="fa-solid fa-message" /> Message
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="Tell us how we can help..."
                  rows={6}
                  className={getFieldClass('message')}
                />
                {touched.message && errors.message && (
                  <span className="field-error"><i className="fa-solid fa-circle-exclamation" /> {errors.message}</span>
                )}
                <span className="char-count">{formData.message.length} characters</span>
              </div>

              <button
                type="submit"
                className="form-submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="btn-spinner" />
                    Sending...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-paper-plane" />
                    Send Message
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default Contact
