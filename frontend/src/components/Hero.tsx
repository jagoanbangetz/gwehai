import './Hero.css'

const Hero = () => {
  return (
    <section className="hero">
      <div className="hero-container">
        <h1 className="hero-title">
          GwehAI: Your AI-Powered
          <br />
          <span className="hero-title-accent">Cybersecurity Pentester</span>
        </h1>
        <p className="hero-description">
          GwehAI is an advanced AI agent specialized in cybersecurity automation and penetration testing. 
          Recognize exploits, generate professional pentest reports, and interact with an intelligent 
          security assistant. Professional-grade security testing, automated.
        </p>
        <div className="hero-cta">
          <button className="hero-button primary">Start Pentesting</button>
          <button className="hero-button secondary" onClick={() => document.getElementById('chat')?.scrollIntoView({ behavior: 'smooth' })}>Try AI Chat</button>
        </div>
      </div>
    </section>
  )
}

export default Hero
