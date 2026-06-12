import { useState } from 'react'
import type { HacktivityRow, HacktivityConversationRow } from '../types'
import { formatReportTime } from '../utils'

/* ── Tool icon mapping ── */
const TOOL_ICON_MAP: Record<string, { icon: string; color: string }> = {
  nuclei:          { icon: 'fa-solid fa-biohazard',       color: '#f59e0b' },
  nikto:           { icon: 'fa-solid fa-spider',          color: '#f59e0b' },
  nmap:            { icon: 'fa-solid fa-network-wired',   color: '#f59e0b' },
  masscan:         { icon: 'fa-solid fa-satellite-dish',  color: '#f59e0b' },
  subfinder:       { icon: 'fa-solid fa-satellite',       color: '#f59e0b' },
  sqlmap:          { icon: 'fa-solid fa-database',        color: '#ef4444' },
  metasploit:      { icon: 'fa-solid fa-skull-crossbones', color: '#ef4444' },
  xss:             { icon: 'fa-solid fa-bug',             color: '#ef4444' },
  sqli:            { icon: 'fa-solid fa-database',        color: '#ef4444' },
  rce:             { icon: 'fa-solid fa-terminal',        color: '#ef4444' },
  hydra:           { icon: 'fa-solid fa-key',             color: '#a855f7' },
  john:            { icon: 'fa-solid fa-unlock-keyhole',  color: '#a855f7' },
  ffuf:            { icon: 'fa-solid fa-folder-tree',     color: '#6366f1' },
  gobuster:        { icon: 'fa-solid fa-folder-open',     color: '#6366f1' },
  attack_chain:    { icon: 'fa-solid fa-link',            color: '#ef4444' },
  craft_payload:   { icon: 'fa-solid fa-bomb',            color: '#ef4444' },
  jwt_analyze:     { icon: 'fa-solid fa-key',             color: '#a855f7' },
  report_finding:  { icon: 'fa-solid fa-flag',            color: '#22c55e' },
  re_verify_findings: { icon: 'fa-solid fa-clipboard-check', color: '#22c55e' },
  memory_search:   { icon: 'fa-solid fa-brain',           color: '#22c55e' },
  exec:            { icon: 'fa-solid fa-terminal',        color: '#22c55e' },
  write_file:      { icon: 'fa-solid fa-file-pen',        color: '#22c55e' },
  sessions_spawn:  { icon: 'fa-solid fa-users-gear',      color: '#22c55e' },
  sessions_send:   { icon: 'fa-solid fa-paper-plane',     color: '#22c55e' },
  browser_action:  { icon: 'fa-solid fa-globe',           color: '#f59e0b' },
}

const DEFAULT_ICON = { icon: 'fa-solid fa-terminal', color: '#6b7280' }

function getIcon(toolArgs: Record<string, unknown> | null): { icon: string; color: string } {
  if (!toolArgs) return DEFAULT_ICON
  const name = (toolArgs.name ?? toolArgs.tool) as string | undefined
  if (name) {
    const key = name.trim().toLowerCase()
    if (TOOL_ICON_MAP[key]) return TOOL_ICON_MAP[key]
    if (name === 'exec' && typeof toolArgs.command === 'string') {
      const cmd = toolArgs.command.trim().toLowerCase().split(/\s+/)[0].split('/').pop() || ''
      if (TOOL_ICON_MAP[cmd]) return TOOL_ICON_MAP[cmd]
    }
  }
  return DEFAULT_ICON
}

/* ── Truncate helpers ── */
function trunc(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str
}

/* ── Result formatter ── */
function formatResult(result: string): string {
  // Try to pretty-print JSON
  const trimmed = result.trim()
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2)
    } catch { /* not valid JSON, return as-is */ }
  }
  return result
}

/* ── Props ── */
interface Props {
  selectedHacktivity: HacktivityRow | null
  hacktivityList: HacktivityRow[]
  hacktivityConversations: HacktivityConversationRow[]
  selectedHacktivityConversationId: string | null
  hacktivityPage: number
  hacktivityTotal: number
  hacktivityPageSize: number
  isLoading: boolean
  loadError: string | null
  onSelectHacktivity: (row: HacktivityRow | null) => void
  onSelectHacktivityId: (id: string | null) => void
  onSelectConversation: (id: string | null) => void
  onPageChange: (page: number) => void
  onLoadHacktivity: (page: number, conversationId: string | null) => void
  getActionLabel: (toolArgs: Record<string, unknown> | null) => string
  onClose: () => void
}

export default function HacktivityModal({
  selectedHacktivity,
  hacktivityList,
  hacktivityConversations,
  selectedHacktivityConversationId,
  hacktivityPage,
  hacktivityTotal,
  hacktivityPageSize,
  isLoading,
  loadError,
  onSelectHacktivity,
  onSelectHacktivityId,
  onSelectConversation,
  onPageChange,
  onLoadHacktivity,
  getActionLabel,
  onClose,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(hacktivityTotal / hacktivityPageSize))
  const [hideErrors, setHideErrors] = useState(false)

  /* Detect error entries: result is null / empty / whitespace-only */
  function isError(row: HacktivityRow): boolean {
    return !row.result || row.result.trim().length === 0
  }

  /* Filtered list for display */
  const displayList = hideErrors ? hacktivityList.filter((r) => !isError(r)) : hacktivityList

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content hacktivity-modal" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="hacktivity-header">
          <div className="hacktivity-header-left">
            <h2 className="hacktivity-title">
              <i className="fa-solid fa-bolt-lightning" style={{ color: '#f59e0b', marginRight: 8, fontSize: '1.2rem' }} />
              {selectedHacktivity ? 'Action Detail' : 'Hacktivity'}
            </h2>
            {!selectedHacktivity && (
              <p className="hacktivity-subtitle">Real-time log of every action your AI agents take</p>
            )}
          </div>
          <div className="hacktivity-header-right">
            {selectedHacktivity && (
              <button className="hacktivity-back-btn" onClick={() => { onSelectHacktivityId(null); onSelectHacktivity(null) }}>
                <i className="fa-solid fa-arrow-left" /> Back
              </button>
            )}
            <button className="modal-close" onClick={onClose}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="hacktivity-body">
          {selectedHacktivity ? (
            /* ═══════ DETAIL VIEW ═══════ */
            <div className="hacktivity-detail">
              {/* Meta cards */}
              <div className="hacktivity-meta-grid">
                <div className="hacktivity-meta-card">
                  <i className="fa-solid fa-clock" />
                  <div>
                    <span className="hacktivity-meta-label">Time</span>
                    <span className="hacktivity-meta-value">{formatReportTime(selectedHacktivity.createdAt)}</span>
                  </div>
                </div>
                {selectedHacktivity.domain && (
                  <div className="hacktivity-meta-card">
                    <i className="fa-solid fa-globe" />
                    <div>
                      <span className="hacktivity-meta-label">Target</span>
                      <span className="hacktivity-meta-value hacktivity-meta-domain">{trunc(selectedHacktivity.domain, 40)}</span>
                    </div>
                  </div>
                )}
                <div className="hacktivity-meta-card">
                  {(() => { const { icon, color } = getIcon(selectedHacktivity.toolArgs); return <i className={icon} style={{ color }} /> })()}
                  <div>
                    <span className="hacktivity-meta-label">Action</span>
                    <span className="hacktivity-meta-value">{getActionLabel(selectedHacktivity.toolArgs)}</span>
                  </div>
                </div>
                {selectedHacktivity.conversationId && (
                  <div className="hacktivity-meta-card">
                    <i className="fa-solid fa-message" />
                    <div>
                      <span className="hacktivity-meta-label">Conversation</span>
                      <code className="hacktivity-meta-code">{trunc(selectedHacktivity.conversationId, 12)}</code>
                    </div>
                  </div>
                )}
              </div>

              {/* Tool arguments */}
              {selectedHacktivity.toolArgs && Object.keys(selectedHacktivity.toolArgs).length > 0 && (
                <section className="hacktivity-section">
                  <h3 className="hacktivity-section-title">
                    <i className="fa-solid fa-gears" /> Arguments
                  </h3>
                  <div className="hacktivity-args-grid">
                    {Object.entries(selectedHacktivity.toolArgs).map(([k, v]) => {
                      const isNested = v !== null && typeof v === 'object'
                      const strVal = isNested ? JSON.stringify(v, null, 2) : String(v ?? '')
                      const isLong = !isNested && strVal.length > 100

                      return (
                        <div key={k} className="hacktivity-arg-item">
                          <code className="hacktivity-arg-key">{k}</code>
                          <span className="hacktivity-arg-value">
                            {isNested ? (
                              <details className="hacktivity-arg-details">
                                <summary>
                                  <i className="fa-solid fa-braces" style={{ marginRight: 4, opacity: 0.5 }} />
                                  {Array.isArray(v) ? `Array(${(v as unknown[]).length})` : `Object (${Object.keys(v as Record<string, unknown>).length} keys)`}
                                </summary>
                                <pre className="hacktivity-arg-pre">{strVal}</pre>
                              </details>
                            ) : isLong ? (
                              <details className="hacktivity-arg-details">
                                <summary>{strVal.slice(0, 100)}…</summary>
                                <pre className="hacktivity-arg-pre">{strVal}</pre>
                              </details>
                            ) : (
                              strVal
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <details className="hacktivity-raw-toggle">
                    <summary>View raw JSON</summary>
                    <pre className="hacktivity-pre">{JSON.stringify(selectedHacktivity.toolArgs, null, 2)}</pre>
                  </details>
                </section>
              )}

              {/* Result */}
              {selectedHacktivity.result != null && (
                <section className="hacktivity-section">
                  <h3 className="hacktivity-section-title">
                    <i className="fa-solid fa-clipboard-check" /> Result
                  </h3>
                  {(() => {
                    const resultStr = formatResult(String(selectedHacktivity.result))
                    const isLong = resultStr.length > 200
                    return isLong ? (
                      <details className="hacktivity-result-details">
                        <summary className="hacktivity-result-summary">
                          <span className="hacktivity-result-preview">{resultStr.slice(0, 200)}…</span>
                          <span className="hacktivity-result-toggle hacktivity-result-expand">
                            <i className="fa-solid fa-chevron-down" /> Expand
                          </span>
                          <span className="hacktivity-result-toggle hacktivity-result-collapse">
                            <i className="fa-solid fa-chevron-up" /> Collapse
                          </span>
                        </summary>
                        <pre className="hacktivity-pre hacktivity-result">{resultStr}</pre>
                      </details>
                    ) : (
                      <pre className="hacktivity-pre hacktivity-result">{resultStr}</pre>
                    )
                  })()}
                </section>
              )}
            </div>
          ) : (
            /* ═══════ LIST VIEW ═══════ */
            <>
              {/* Error banner */}
              {loadError && (
                <div className="hacktivity-error">
                  <i className="fa-solid fa-triangle-exclamation" /> {loadError}
                  <button className="hacktivity-retry-btn" onClick={() => onLoadHacktivity(hacktivityPage, selectedHacktivityConversationId)}>
                    Retry
                  </button>
                </div>
              )}

              {/* Filter + toolbar */}
              <div className="hacktivity-toolbar">
                <div className="hacktivity-toolbar-left">
                  <label className="hacktivity-filter">
                    <i className="fa-solid fa-filter" />
                    <select
                      value={selectedHacktivityConversationId ?? ''}
                      onChange={(e) => {
                        const id = e.target.value || null
                        onSelectConversation(id)
                        onPageChange(1)
                        onLoadHacktivity(1, id)
                      }}
                    >
                      <option value="">All conversations</option>
                      {hacktivityConversations.map((c) => (
                        <option key={c.conversationId} value={c.conversationId}>
                          {trunc(c.title || c.conversationId, 30)} ({c.count})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className={`hacktivity-hide-errors${hideErrors ? ' hacktivity-hide-errors--active' : ''}`}
                    onClick={() => setHideErrors((v) => !v)}
                    title={hideErrors ? 'Show error entries' : 'Hide error entries'}
                  >
                    <i className={hideErrors ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'} />
                    {hideErrors ? 'Errors hidden' : 'Hide errors'}
                  </button>
                </div>
                <span className="hacktivity-count">{hacktivityTotal} actions</span>
              </div>

              {/* Cards */}
              <div className="hacktivity-list">
                {isLoading ? (
                  <div className="hacktivity-loading">
                    <i className="fa-solid fa-spinner fa-spin" /> Loading hacktivity…
                  </div>
                ) : hacktivityList.length === 0 ? (
                  <div className="hacktivity-empty">
                    <i className="fa-solid fa-inbox" />
                    <p>No actions recorded yet</p>
                    <span>Run a pentest to see AI actions appear here in real-time</span>
                  </div>
                ) : (
                  displayList.map((row) => {
                    const { icon, color } = getIcon(row.toolArgs)
                    const error = isError(row)
                    return (
                      <div
                        key={row.id}
                        className={`hacktivity-card${error ? ' hacktivity-card--error' : ''}`}
                        onClick={() => { onSelectHacktivityId(row.id); onSelectHacktivity(row) }}
                      >
                        <div className="hacktivity-card-icon" style={{ background: color + '99', color: 'white', fontSize: '1.1rem' }}>
                          <i className={icon} />
                        </div>
                        <div className="hacktivity-card-body">
                          <div className="hacktivity-card-top">
                            <span className="hacktivity-card-action">
                              {getActionLabel(row.toolArgs)}
                              {error && (
                                <span className="hacktivity-error-badge">
                                  <i className="fa-solid fa-circle-exclamation" /> ERROR
                                </span>
                              )}
                            </span>
                            <span className="hacktivity-card-time">{formatReportTime(row.createdAt)}</span>
                          </div>
                          <div className="hacktivity-card-bottom">
                            {row.domain ? (
                              <span className="hacktivity-card-domain">
                                <i className="fa-solid fa-globe" /> {trunc(row.domain, 35)}
                              </span>
                            ) : (
                              <span className="hacktivity-card-domain hacktivity-card-domain--empty">No target</span>
                            )}
                            {row.result && (
                              <span className="hacktivity-card-preview">{trunc(row.result, 60)}</span>
                            )}
                          </div>
                        </div>
                        <div className="hacktivity-card-chevron">
                          <i className="fa-solid fa-chevron-right" />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="hacktivity-pagination">
                  <button
                    className="hacktivity-page-btn"
                    disabled={hacktivityPage <= 1}
                    onClick={() => { const p = hacktivityPage - 1; onPageChange(p); onLoadHacktivity(p, selectedHacktivityConversationId) }}
                  >
                    <i className="fa-solid fa-chevron-left" /> Prev
                  </button>
                  <span className="hacktivity-page-info">{hacktivityPage} / {totalPages}</span>
                  <button
                    className="hacktivity-page-btn"
                    disabled={hacktivityPage >= totalPages}
                    onClick={() => { const p = hacktivityPage + 1; onPageChange(p); onLoadHacktivity(p, selectedHacktivityConversationId) }}
                  >
                    Next <i className="fa-solid fa-chevron-right" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
