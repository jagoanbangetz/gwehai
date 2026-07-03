import { useEffect, useRef, useState, useCallback } from 'react'
import './Testimonials.css'

interface Testimonial {
  name: string
  role: string
  company: string
  quote: string
  avatar: string
}

const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Arief Pratama',
    role: 'CISO',
    company: 'Bank Digital Nusantara',
    quote: 'GwehAI cut our pentest cycle from 3 weeks to 2 days. The AI-driven recon alone saved our team hundreds of hours.',
    avatar: 'AP',
  },
  {
    name: 'Sarah Chen',
    role: 'Security Lead',
    company: 'FinTech Corp',
    quote: 'The automated reporting is a game changer. Our compliance team gets clean, actionable reports without back-and-forth.',
    avatar: 'SC',
  },
  {
    name: 'Dimas Kurniawan',
    role: 'DevSecOps Engineer',
    company: 'CloudScale.id',
    quote: 'We integrated GwehAI into our CI/CD pipeline. Every PR now gets an automatic security scan before merge. Zero config overhead.',
    avatar: 'DK',
  },
  {
    name: 'Lisa Wijaya',
    role: 'VP Engineering',
    company: 'E-Shop Asia',
    quote: 'After one scan, GwehAI found a critical IDOR vulnerability our manual audit missed. Worth every cent.',
    avatar: 'LW',
  },
  {
    name: 'Rizky Hidayat',
    role: 'Founder',
    company: 'SecureStack',
    quote: 'The AI agent thinks like a real attacker. It chains vulnerabilities together — something automated scanners never do well.',
    avatar: 'RH',
  },
]

const CARD_WIDTH = 340
const GAP = 20
const SCROLL_INTERVAL = 3500

const Testimonials = () => {
  const trackRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const indexRef = useRef(0)

  const scrollTo = useCallback((idx: number) => {
    const track = trackRef.current
    if (!track) return
    const offset = idx * (CARD_WIDTH + GAP)
    track.scrollTo({ left: offset, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (paused) return

    const timer = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % TESTIMONIALS.length
      scrollTo(indexRef.current)
    }, SCROLL_INTERVAL)

    return () => clearInterval(timer)
  }, [paused, scrollTo])

  /* Duplicate cards for infinite-loop feel */
  const cards = [...TESTIMONIALS, ...TESTIMONIALS]

  return (
    <section className="testimonials">
      <div className="testimonials-container">
        <h2 className="testimonials-title">Trusted by Security Teams</h2>
        <p className="testimonials-subtitle">
          Real feedback from teams using GwehAI every day.
        </p>

        <div
          className="testimonials-viewport"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="testimonials-track" ref={trackRef}>
            {cards.map((t, i) => (
              <div className="testimonial-card" key={i}>
                <div className="testimonial-quote">
                  <i className="fa-solid fa-quote-left quote-icon"></i>
                  <p>{t.quote}</p>
                </div>
                <div className="testimonial-author">
                  <div className="testimonial-avatar">{t.avatar}</div>
                  <div>
                    <div className="testimonial-name">{t.name}</div>
                    <div className="testimonial-role">{t.role}, {t.company}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default Testimonials
