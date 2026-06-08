import type { FindingRow } from '../types'

interface Props {
  finding: FindingRow
  onClose: () => void
}

export default function FindingDetailModal({ finding, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content report-poc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {(finding.metadata as any)?.title || 'Finding detail'}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="modal-body report-poc-body">
          {finding.target && (
            <p className="report-poc-target"><strong>Target:</strong> {finding.target}</p>
          )}
          {(finding.metadata as any)?.severity && (
            <p className="report-poc-severity">
              <strong>Severity:</strong>{' '}
              <span className={`severity-badge severity-${((finding.metadata as any).severity || '').toLowerCase()}`}>
                {(finding.metadata as any).severity}
              </span>
            </p>
          )}
          {finding.detail && (
            <section className="report-poc-section">
              <h3>Description</h3>
              <pre className="report-poc-detail">{finding.detail}</pre>
            </section>
          )}
          {finding.poc && (
            <section className="report-poc-section">
              <h3>Proof of Concept (POC)</h3>
              <pre className="report-poc-poc">{finding.poc}</pre>
            </section>
          )}
          {!finding.detail && !finding.poc && (
            <p className="report-poc-empty">No description or POC saved for this finding.</p>
          )}
        </div>
      </div>
    </div>
  )
}
