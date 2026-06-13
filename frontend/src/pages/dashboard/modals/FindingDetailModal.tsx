import type { FindingRow } from '../types'
import { formatReportTime } from '../utils'

interface Props {
  finding: FindingRow
  onClose: () => void
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ff4444',
  high: '#ff8800',
  medium: '#ffcc00',
  low: '#44aaff',
  info: '#888888',
}

export default function FindingDetailModal({ finding, onClose }: Props) {
  const sev = ((finding.metadata as any)?.severity || 'info').toLowerCase()
  const title = (finding.metadata as any)?.title || 'Finding detail'
  const confidence = (finding.metadata as any)?.confidence as number | undefined

  return (
    <div className="modal-overlay finding-detail-overlay" onClick={onClose}>
      <div className="modal-content report-poc-modal finding-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header finding-detail-header">
          <div className="finding-detail-title-group">
            <h2 className="modal-title finding-detail-title">{title}</h2>
            <span
              className="finding-detail-severity-pill"
              style={{
                background: SEVERITY_COLORS[sev] || SEVERITY_COLORS.info,
                color: sev === 'medium' ? '#1a1a1a' : '#ffffff',
              }}
            >
              {sev}
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="modal-body report-poc-body finding-detail-body">
          {/* Metadata row */}
          <div className="finding-detail-meta-row">
            {finding.target && (
              <div className="finding-detail-meta-item">
                <i className="fa-solid fa-crosshairs" />
                <span className="finding-detail-meta-label">Target</span>
                <span className="finding-detail-meta-value finding-detail-target-url">{finding.target}</span>
              </div>
            )}
            {confidence != null && (
              <div className="finding-detail-meta-item">
                <i className="fa-solid fa-chart-line" />
                <span className="finding-detail-meta-label">Confidence</span>
                <span className="finding-detail-meta-value">
                  <span className="finding-detail-confidence-bar">
                    <span
                      className="finding-detail-confidence-fill"
                      style={{
                        width: `${Math.round(confidence * 100)}%`,
                        background: confidence >= 0.8 ? '#ff4444' : confidence >= 0.5 ? '#ffcc00' : '#44aaff',
                      }}
                    />
                  </span>
                  {Math.round(confidence * 100)}%
                </span>
              </div>
            )}
            <div className="finding-detail-meta-item">
              <i className="fa-regular fa-clock" />
              <span className="finding-detail-meta-label">Detected</span>
              <span className="finding-detail-meta-value">{formatReportTime(finding.createdAt)}</span>
            </div>
          </div>

          {/* Description */}
          {finding.detail && (
            <section className="report-poc-section finding-detail-section">
              <h3>
                <i className="fa-solid fa-file-lines" /> Description
              </h3>
              <pre className="report-poc-detail">{finding.detail}</pre>
            </section>
          )}

          {/* POC / Evidence */}
          {finding.poc && (
            <section className="report-poc-section finding-detail-section">
              <h3>
                <i className="fa-solid fa-flask" /> Proof of Concept (POC)
              </h3>
              <pre className="report-poc-poc">{finding.poc}</pre>
            </section>
          )}

          {/* Empty state */}
          {!finding.detail && !finding.poc && (
            <div className="report-poc-empty">
              <i className="fa-regular fa-clipboard" />
              <p>No description or POC saved for this finding.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
