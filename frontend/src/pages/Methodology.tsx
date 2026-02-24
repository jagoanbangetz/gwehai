import Header from '../components/Header'
import Footer from '../components/Footer'
import AnimatedBackground from '../components/AnimatedBackground'
import './Legal.css'

const Methodology = () => {
  return (
    <div className="legal-page dark-theme">
      <AnimatedBackground variant="full" intensity="low" />
      <Header />
      <main className="legal-content">
        <div className="legal-container">
          <h1 className="legal-title">Methodology</h1>
          <p className="legal-updated">
            How GwehAI approaches security testing — the concepts, standards, and phases we use to deliver consistent, professional results.
          </p>

          <section className="legal-section">
            <h2>Overview</h2>
            <p>
              GwehAI runs automated penetration tests using a structured, phase-based methodology aligned with industry standards. Our AI orchestrates reconnaissance, vulnerability analysis, and safe exploit validation, then produces reports that map to common frameworks so your team and auditors get clear, actionable output.
            </p>
          </section>

          <section className="legal-section">
            <h2>Testing phases we use</h2>
            <p>
              Each run follows a clear lifecycle so coverage is consistent and repeatable:
            </p>
            <ul>
              <li><strong>Reconnaissance</strong> — Gathering information about the target (DNS, subdomains, open ports, technologies) to define scope and attack surface.</li>
              <li><strong>Scanning &amp; enumeration</strong> — Identifying services, versions, and potential weak points without performing intrusive exploitation.</li>
              <li><strong>Vulnerability assessment</strong> — Evaluating findings against known CVEs, misconfigurations, and common weaknesses (e.g. OWASP Top 10).</li>
              <li><strong>Exploitation (controlled)</strong> — Where appropriate and within your rules, validating critical issues with safe proof-of-concept steps to confirm impact.</li>
              <li><strong>Reporting</strong> — Summarizing findings with severity, evidence, and remediation guidance, and mapping to compliance or framework requirements where relevant.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>Standards and frameworks we align with</h2>
            <p>
              Our approach is designed to align with widely used standards so results fit into your existing processes:
            </p>
            <ul>
              <li><strong>OWASP</strong> — Especially the OWASP Top 10 and Testing Guide for web application security.</li>
              <li><strong>PTES</strong> — Penetration Testing Execution Standard for a consistent, phase-based pentest process.</li>
              <li><strong>NIST</strong> — NIST Cybersecurity Framework and related guidance where applicable to risk and controls.</li>
              <li><strong>CWE / CVE</strong> — Findings are tied to common weakness and vulnerability identifiers where possible.</li>
              <li><strong>Compliance mapping</strong> — We support mapping findings to requirements such as PCI-DSS, SOC 2, ISO 27001, and others so you can use reports for both technical remediation and compliance evidence.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>How the AI fits in</h2>
            <p>
              GwehAI uses AI to drive the workflow: it decides which steps to run next, interprets tool output, correlates findings, and drafts narrative for reports. The model is trained and prompted to follow the phases above and to stay within safe, authorized testing (e.g. no destructive actions, respect for scope and rate limits). You stay in control via target configuration, guardrails, and plan limits; the AI executes the methodology consistently at scale.
            </p>
          </section>

          <section className="legal-section">
            <h2>Responsible use and scope</h2>
            <p>
              Testing must be limited to targets you are authorized to test. We enforce guardrails (e.g. blocking certain targets or behaviors when configured) and fair-use limits so the service remains reliable for everyone. By using GwehAI you agree to use it only on systems you own or have explicit permission to test, and to comply with our terms of service and acceptable use policy.
            </p>
          </section>

          <section className="legal-section">
            <h2>Summary</h2>
            <p>
              We use a phase-based, standards-aligned methodology (recon → scan → assess → exploit where appropriate → report) so you get consistent, professional pentest output. The AI runs this process for you and produces reports that explain what we found and how it maps to frameworks like OWASP and compliance needs. If you have questions about how we apply this to your environment, contact us.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default Methodology
