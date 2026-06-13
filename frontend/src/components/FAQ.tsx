import { useState } from 'react'
import './FAQ.css'

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const faqs = [
    {
      question: 'How does GwehAI recognize exploits?',
      answer: 'GwehAI uses advanced AI algorithms trained on thousands of known exploits, CVEs, and attack patterns. It analyzes code, network traffic, and system configurations to identify potential security vulnerabilities and classify them according to industry standards like OWASP Top 10 and CWE.',
    },
    {
      question: 'What types of security testing does GwehAI perform?',
      answer: 'GwehAI performs comprehensive penetration testing including web application security, network penetration testing, API security assessment, cloud security testing, mobile application security, and social engineering simulation.',
    },
    {
      question: 'How detailed are the pentest reports?',
      answer: 'GwehAI generates professional-grade pentest reports that include executive summaries, detailed technical findings with proof-of-concept exploits, CVSS scores, risk assessments, remediation recommendations, compliance mapping (OWASP, NIST, PCI-DSS), and visual diagrams.',
    },
    {
      question: 'Can GwehAI be integrated into our CI/CD pipeline?',
      answer: 'Yes, GwehAI offers API access and can be integrated into CI/CD pipelines for continuous security testing. It supports automated scanning on code commits, scheduled security assessments, and can trigger alerts when vulnerabilities are detected.',
    },
    {
      question: 'Is GwehAI safe to use on production systems?',
      answer: 'GwehAI is designed with safety in mind. It uses read-only scanning techniques by default and requires explicit authorization for any active testing. All testing is performed in isolated environments when possible.',
    },
    {
      question: 'What compliance frameworks does GwehAI support?',
      answer: 'GwehAI supports mapping findings to multiple compliance frameworks including OWASP Top 10, CWE, NIST Cybersecurity Framework, PCI-DSS, GDPR, HIPAA, ISO 27001, and SOC 2.',
    },
  ]

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section className="faq">
      <div className="faq-container">
        <h2 className="faq-title">
          Frequently Asked Questions
        </h2>
        <p className="faq-subtitle">
          Everything you need to know about GwehAI
        </p>
        <div className="faq-list">
          {faqs.map((faq, index) => (
            <div key={index} className={`faq-item ${openIndex === index ? 'open' : ''}`}>
              <button
                className="faq-question"
                onClick={() => toggleFAQ(index)}
              >
                <span>{faq.question}</span>
                <span className="faq-icon">
                  <i className={`fa-solid ${openIndex === index ? 'fa-minus' : 'fa-plus'}`}></i>
                </span>
              </button>
              <div className={`faq-answer ${openIndex === index ? 'visible' : ''}`}>
                <p>{faq.answer}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="faq-cta">
          <button className="hero-button primary">
            <i className="fa-solid fa-rocket"></i>
            Get Started For Free
          </button>
        </div>
      </div>
    </section>
  )
}

export default FAQ
