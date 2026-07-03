import { useEffect, useRef } from 'react'
import './Stats.css'

const Stats = () => {
  const sectionRef = useRef<HTMLDivElement>(null)
  const valueRefs = useRef<(HTMLDivElement | null)[]>([])

  const stats = [
    { target: 10000, suffix: 'K+', label: 'Scans Completed', display: '10K+' },
    { target: 500, suffix: '+', label: 'Enterprise Clients', display: '500+' },
    { target: 99.9, suffix: '%', label: 'Uptime SLA', display: '99.9%', decimals: 1 },
    { target: 2, suffix: 's', label: 'Avg Response Time', display: '<2s', prefix: '<' },
  ]

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            valueRefs.current.forEach((el, i) => {
              if (!el) return
              const stat = stats[i]
              const elRef = el

              const duration = 1500
              const start = performance.now()
              const from = 0

              const animate = (now: number) => {
                const elapsed = now - start
                const progress = Math.min(elapsed / duration, 1)
                // ease-out cubic
                const eased = 1 - Math.pow(1 - progress, 3)
                const current = from + (stat.target - from) * eased

                if (stat.decimals) {
                  elRef.textContent = `${stat.prefix || ''}${current.toFixed(stat.decimals)}${stat.suffix}`
                } else if (stat.display && stat.target >= 1000) {
                  // For 10K+ style: show number counting up then snap to display
                  if (progress < 0.95) {
                    elRef.textContent = `${Math.floor(current).toLocaleString()}+`
                  } else {
                    elRef.textContent = stat.display
                  }
                } else {
                  elRef.textContent = `${stat.prefix || ''}${Math.floor(current)}${stat.suffix}`
                }

                if (progress < 1) {
                  requestAnimationFrame(animate)
                } else {
                  // Final snap to display value
                  elRef.textContent = stat.display
                }
              }

              requestAnimationFrame(animate)
            })
            observer.unobserve(section)
          }
        })
      },
      { threshold: 0.3 }
    )

    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="stats-section" ref={sectionRef}>
      <div className="stats-container">
        <div className="stats-grid">
          {stats.map((stat, index) => (
            <div key={index} className="stat-card">
              <div
                className="stat-value"
                ref={(el) => { valueRefs.current[index] = el }}
              >
                0
              </div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Stats
