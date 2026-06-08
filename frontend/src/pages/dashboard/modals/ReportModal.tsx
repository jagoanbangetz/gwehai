import type { ReportGroupRow, FindingRow } from '../types'
import { formatReportTime, formatReportDuration } from '../utils'
import FindingDetailModal from './FindingDetailModal'

interface Props {
  reports: ReportGroupRow[]
  isLoading: boolean
  reportDetailKey: { domain: string; date: string; conversationId: string | null } | null
  findings: FindingRow[]
  findingsLoading: boolean
  selectedFinding: FindingRow | null
  onSetDetailKey: (key: { domain: string; date: string; conversationId: string | null } | null) => void
  onSetFindings: (findings: FindingRow[]) => void
  onSelectFinding: (finding: FindingRow | null) => void
  onSelectFindingId: (id: string | null) => void
  onLoadFindings: (domain: string, date: string, conversationId?: string | null) => void
  onClose: () => void
}

export default function ReportModal({
  reports,
  isLoading,
  reportDetailKey,
  findings,
  findingsLoading,
  selectedFinding,
  onSetDetailKey,
  onSetFindings,
  onSelectFinding,
  onSelectFindingId,
  onLoadFindings,
  onClose,
}: Props) {
  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content report-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">
              {reportDetailKey ? 'Findings for this report' : 'Security Reports'}
            </h2>
            <div className="modal-header-actions">
              {reportDetailKey && (
                <button
                  type="button"
                  className="report-back-btn"
                  onClick={() => {
                    onSetDetailKey(null)
                    onSetFindings([])
                    onSelectFindingId(null)
                    onSelectFinding(null)
                  }}
                >
                  ← Back
                </button>
              )}
              <button className="modal-close" onClick={onClose}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
          <div className="modal-body">
            {!reportDetailKey ? (
              <div className="report-table-container">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Domain</th>
                      <th>Date</th>
                      <th>Conversation</th>
                      <th>Findings</th>
                      <th>First</th>
                      <th>Last</th>
                      <th>Duration</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={8} className="report-loading-cell">
                          Loading reports...
                        </td>
                      </tr>
                    ) : reports.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="report-empty-cell">
                          No reports yet. Run a pentest to see findings here.
                        </td>
                      </tr>
                    ) : (() => {
                        const byDomain = new Map<string, ReportGroupRow[]>()
                        for (const r of reports) {
                          const key = r.domain || '—'
                          if (!byDomain.has(key)) byDomain.set(key, [])
                          byDomain.get(key)!.push(r)
                        }
                        const domains = Array.from(byDomain.entries()).sort((a, b) => (a[0] === '—' ? 1 : b[0] === '—' ? -1 : a[0].localeCompare(b[0])))
                        return domains.flatMap(([domain, rows]) => {
                          const totalFindings = rows.reduce((s, r) => s + r.findingsCount, 0)
                          const headerRow = (
                            <tr key={`domain-${domain}`} className="report-domain-header-row">
                              <td colSpan={8} className="report-domain-header">
                                <span className="report-domain-header-label">{domain}</span>
                                <span className="report-domain-header-meta">{rows.length} report{rows.length !== 1 ? 's' : ''}, {totalFindings} finding{totalFindings !== 1 ? 's' : ''}</span>
                              </td>
                            </tr>
                          )
                          const dataRows = rows.map((report) => {
                            const rowKey = `${report.domain}|${report.conversationId ?? ''}|${report.date}|${report.createdAt || ''}`
                            const convDisplay = report.conversationId ? `${report.conversationId.slice(0, 8)}…` : '—'
                            return (
                              <tr key={rowKey} className="report-run-row">
                                <td className="report-domain report-domain-sub" title={report.domain || '—'}></td>
                                <td className="report-date">{report.date || '—'}</td>
                                <td className="report-conversation" title={report.conversationId ?? ''}>
                                  {convDisplay}
                                </td>
                                <td className="report-findings-count">{report.findingsCount}</td>
                                <td className="report-time">{formatReportTime(report.firstAt || null)}</td>
                                <td className="report-time">{formatReportTime(report.lastAt || null)}</td>
                                <td className="report-duration">{formatReportDuration(report.firstAt || null, report.lastAt || null)}</td>
                                <td className="report-actions">
                                  <button
                                    type="button"
                                    className="report-view-btn"
                                    onClick={() => {
                                      onSetDetailKey({ domain: report.domain, date: report.date, conversationId: report.conversationId })
                                      onLoadFindings(report.domain, report.date, report.conversationId)
                                    }}
                                  >
                                    View
                                  </button>
                                </td>
                              </tr>
                            )
                          })
                          return [headerRow, ...dataRows]
                        })
                    })()}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="report-findings-container">
                {findingsLoading ? (
                  <div className="report-loading-cell">Loading findings...</div>
                ) : findings.length === 0 ? (
                  <div className="report-empty-cell">No findings for this report.</div>
                ) : (
                  <table className="report-table findings-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Severity</th>
                        <th>Target</th>
                        <th>Date</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {findings.map((f) => (
                        <tr key={f.id} className="finding-row">
                          <td className="finding-title">{(f.metadata as any)?.title || 'Untitled finding'}</td>
                          <td className="finding-severity">
                            <span className={`severity-badge severity-${((f.metadata as any)?.severity || '').toLowerCase()}`}>
                              {(f.metadata as any)?.severity || '—'}
                            </span>
                          </td>
                          <td className="finding-target" title={f.target || ''}>{f.target || '—'}</td>
                          <td className="finding-date">{formatReportTime(f.createdAt)}</td>
                          <td className="finding-actions">
                            <button type="button" className="report-view-btn" onClick={() => {
                              onSelectFinding(f)
                              onSelectFindingId(f.id)
                            }}>
                              Detail
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedFinding && (
        <FindingDetailModal
          finding={selectedFinding}
          onClose={() => { onSelectFindingId(null); onSelectFinding(null) }}
        />
      )}
    </>
  )
}
