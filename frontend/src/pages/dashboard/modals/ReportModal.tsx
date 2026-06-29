import SeverityBadge from '../../../components/pentest/results/SeverityBadge'
import ToolResultTable from '../../../components/pentest/results/ToolResultTable'
import { useState, useMemo } from 'react'
import type { ReportGroupRow, FindingRow } from '../types'
import { formatReportTime, formatReportDuration } from '../utils'
import FindingDetailModal from './FindingDetailModal'

const PAGE_SIZE = 10

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

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const
const SEVERITY_BORDER: Record<string, string> = {
  critical: '5px',
  high: '4px',
  medium: '3px',
  low: '2px',
  info: '1px',
}

function countSeverities(findings: FindingRow[]): Record<string, number> {
  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  for (const f of findings) {
    const sev = ((f.metadata as any)?.severity || 'info').toLowerCase()
    if (sev in counts) counts[sev]++
    else counts.info++
  }
  return counts
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
  const [page, setPage] = useState(0)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')

  /* Group reports by domain */
  const domainGroups = useMemo(() => {
    const map = new Map<string, ReportGroupRow[]>()
    for (const r of reports) {
      const key = r.domain || '—'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[0] === '—' ? 1 : b[0] === '—' ? -1 : a[0].localeCompare(b[0]),
    )
  }, [reports])

  /* Pagination over domain groups */
  const totalPages = Math.max(1, Math.ceil(domainGroups.length / PAGE_SIZE))
  const pagedDomains = domainGroups.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  /* Aggregate totals */
  const totalFindings = reports.reduce((s, r) => s + r.findingsCount, 0)
  const totalDomains = domainGroups.length

  /* Severity counts for current findings view */
  const severityCounts = useMemo(() => countSeverities(findings), [findings])

  /* Export PDF handler */
  const handleExport = () => {
    window.print()
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content report-modal report-modal--enhanced" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="modal-header report-header">
            <div className="report-header-left">
              {reportDetailKey ? (
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
                  <i className="fa-solid fa-arrow-left" /> Back
                </button>
              ) : (
                <div className="report-header-title-group">
                  <h2 className="modal-title">
                    <i className="fa-solid fa-file-shield" /> Security Reports
                  </h2>
                  <span className="report-header-count">
                    <i className="fa-solid fa-bug" /> {totalFindings} findings across {totalDomains} {totalDomains === 1 ? 'domain' : 'domains'}
                  </span>
                </div>
              )}
              {reportDetailKey && (
                <h2 className="modal-title report-detail-title">
                  <i className="fa-solid fa-magnifying-glass" /> Findings &mdash; {reportDetailKey.domain}
                </h2>
              )}
            </div>
            <div className="modal-header-actions">
              <button type="button" className="report-export-btn" onClick={handleExport} title="Export / Print PDF">
                <i className="fa-solid fa-file-pdf" /> Export PDF
              </button>
              <button className="modal-close" onClick={onClose}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          </div>

          <div className="modal-body report-body">
            {/* === REPORT LIST VIEW === */}
            {!reportDetailKey ? (
              <>
                {/* Severity summary — not available at list level, show total summary */}
                {reports.length > 0 && (
                  <div className="report-summary-bar">
                    <div className="report-summary-stat">
                      <i className="fa-solid fa-globe" />
                      <span className="report-summary-value">{totalDomains}</span>
                      <span className="report-summary-label">{totalDomains === 1 ? 'Domain' : 'Domains'}</span>
                    </div>
                    <div className="report-summary-stat">
                      <i className="fa-solid fa-bug" />
                      <span className="report-summary-value">{totalFindings}</span>
                      <span className="report-summary-label">Findings</span>
                    </div>
                    <div className="report-summary-stat">
                      <i className="fa-solid fa-clock" />
                      <span className="report-summary-value">{reports.length}</span>
                      <span className="report-summary-label">{reports.length === 1 ? 'Scan' : 'Scans'}</span>
                    </div>
                  </div>
                )}

                {/* Domain cards */}
                <div className="report-domain-cards">
                  {isLoading ? (
                    <div className="report-loading-state">
                      <i className="fa-solid fa-spinner fa-spin" /> Loading reports...
                    </div>
                  ) : reports.length === 0 ? (
                    <div className="report-empty-state">
                      <i className="fa-solid fa-folder-open" />
                      <p>No reports yet. Run a pentest to see findings here.</p>
                    </div>
                  ) : (
                    pagedDomains.map(([domain, rows]) => {
                      const domainFindings = rows.reduce((s, r) => s + r.findingsCount, 0)
                      const latestDate = rows[0].lastAt || rows[0].firstAt || rows[0].createdAt
                      return (
                        <div key={domain} className="report-domain-card">
                          <div className="report-domain-card-header">
                            <div className="report-domain-card-title">
                              <i className="fa-solid fa-globe" />
                              <span>{domain}</span>
                            </div>
                            <span className="report-domain-card-badge">
                              {rows.length} {rows.length === 1 ? 'scan' : 'scans'}
                            </span>
                          </div>
                          <div className="report-domain-card-stats">
                            <div className="report-domain-stat">
                              <i className="fa-solid fa-bug" />
                              <span>{domainFindings} {domainFindings === 1 ? 'finding' : 'findings'}</span>
                            </div>
                            <div className="report-domain-stat">
                              <i className="fa-solid fa-clock" />
                              <span>{formatReportTime(latestDate)}</span>
                            </div>
                          </div>
                          <div className="report-domain-card-actions">
                            {rows.map((report) => {
                              const rowKey = `${report.domain}|${report.conversationId ?? ''}|${report.date}|${report.createdAt || ''}`
                              const convDisplay = report.conversationId ? `${report.conversationId.slice(0, 8)}...` : null
                              return (
                                <button
                                  key={rowKey}
                                  type="button"
                                  className="report-card-view-btn"
                                  onClick={() => {
                                    onSetDetailKey({ domain: report.domain, date: report.date, conversationId: report.conversationId })
                                    onLoadFindings(report.domain, report.date, report.conversationId)
                                  }}
                                >
                                  <span className="report-card-view-info">
                                    <i className="fa-solid fa-eye" />
                                    <span>{report.date}</span>
                                    {convDisplay && <span className="report-card-conv">{convDisplay}</span>}
                                    <span className="report-card-fcount">{report.findingsCount} findings</span>
                                  </span>
                                  <span className="report-card-view-duration">
                                    {formatReportDuration(report.firstAt || null, report.lastAt || null)}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Pagination */}
                {domainGroups.length > PAGE_SIZE && (
                  <div className="report-pagination">
                    <button
                      type="button"
                      className="report-page-btn"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <i className="fa-solid fa-chevron-left" />
                    </button>
                    <span className="report-page-info">
                      Page {page + 1} of {totalPages}
                    </span>
                    <button
                      type="button"
                      className="report-page-btn"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <i className="fa-solid fa-chevron-right" />
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* === FINDINGS LIST VIEW === */
              <div className="report-findings-container">
                {findingsLoading ? (
                  <div className="report-loading-state">
                    <i className="fa-solid fa-spinner fa-spin" /> Loading findings...
                  </div>
                ) : findings.length === 0 ? (
                  <div className="report-empty-state">
                    <i className="fa-solid fa-clipboard-check" />
                    <p>No findings for this report.</p>
                  </div>
                ) : (
                  <>
                    {/* Executive Summary */}
                    <div className="report-exec-summary">
                      <div className="report-exec-summary-title">
                        <i className="fa-solid fa-clipboard-list" /> Executive Summary
                      </div>
                      <div className="report-exec-summary-stats">
                        {SEVERITY_ORDER.map((sev) => {
                          const count = severityCounts[sev]
                          if (count === 0 && sev !== 'info') return null
                          return (
                            <div key={sev} className="report-exec-stat">
                              <span className="report-exec-stat-dot" style={{ borderLeft: `${SEVERITY_BORDER[sev]} solid #fff`, width: 0, height: 16 }} />
                              <span className="report-exec-stat-count">{count}</span>
                              <span className="report-exec-stat-label">{sev.charAt(0).toUpperCase() + sev.slice(1)}</span>
                            </div>
                          )
                        })}
                        <div className="report-exec-stat report-exec-stat--total">
                          <span className="report-exec-stat-count">{findings.length}</span>
                          <span className="report-exec-stat-label">Total</span>
                        </div>
                      </div>
                      {severityCounts.critical > 0 && (
                        <div className="report-exec-alert">
                          <i className="fa-solid fa-triangle-exclamation" /> {severityCounts.critical} critical {severityCounts.critical === 1 ? 'finding requires' : 'findings require'} immediate attention
                        </div>
                      )}
                    </div>

                    {/* Severity summary bar + view toggle */}
                    <div className="report-severity-bar">
                      {SEVERITY_ORDER.map((sev) => (
                        <div
                          key={sev}
                          className="report-severity-item"
                        >
                          <span className="report-severity-dot" />
                          <span className="report-severity-label">{sev.charAt(0).toUpperCase() + sev.slice(1)}</span>
                          <span className="report-severity-count">{severityCounts[sev]}</span>
                        </div>
                      ))}
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        <button
                          className={`report-page-btn${viewMode === 'cards' ? ' active' : ''}`}
                          onClick={() => setViewMode('cards')}
                          title="Card view"
                          style={{ fontSize: 11, padding: '3px 8px' }}
                        >
                          <i className="fa-solid fa-grip" />
                        </button>
                        <button
                          className={`report-page-btn${viewMode === 'table' ? ' active' : ''}`}
                          onClick={() => setViewMode('table')}
                          title="Table view"
                          style={{ fontSize: 11, padding: '3px 8px' }}
                        >
                          <i className="fa-solid fa-table-list" />
                        </button>
                      </div>
                    </div>

                    {/* Findings as table or cards */}
                    {viewMode === 'table' ? (
                      <ToolResultTable
                        results={findings.map(f => ({
                          id: f.id,
                          tool: (f.metadata as any)?.tool || 'finding',
                          target: f.target || undefined,
                          severity: ((f.metadata as any)?.severity || 'info') as any,
                          title: (f.metadata as any)?.title || 'Untitled finding',
                          description: f.detail || undefined,
                          output: f.poc || undefined,
                          timestamp: f.createdAt,
                        }))}
                        showFilters
                      />
                    ) : (
                      <div className="report-findings-list">
                        {findings.map((f) => {
                          const sev = ((f.metadata as any)?.severity || 'info').toLowerCase()
                          return (
                            <div key={f.id} className="report-finding-card" onClick={() => { onSelectFinding(f); onSelectFindingId(f.id) }}>
                              <div className="report-finding-card-left">
                                <span
                                  className="report-finding-severity-indicator"
                                  style={{ borderLeft: `${SEVERITY_BORDER[sev]} solid #fff`, background: 'transparent', width: 0, paddingLeft: 4 }}
                                />
                              </div>
                              <div className="report-finding-card-body">
                                <div className="report-finding-card-title">
                                  {(f.metadata as any)?.title || 'Untitled finding'}
                                </div>
                                <div className="report-finding-card-meta">
                                  <SeverityBadge level={sev} compact />
                                  {f.target && (
                                    <span className="report-finding-card-target">
                                      <i className="fa-solid fa-link" /> {f.target}
                                    </span>
                                  )}
                                  <span className="report-finding-card-date">
                                    <i className="fa-regular fa-clock" /> {formatReportTime(f.createdAt)}
                                  </span>
                                </div>
                              </div>
                              <div className="report-finding-card-arrow">
                                <i className="fa-solid fa-chevron-right" />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
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
