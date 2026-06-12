import { useState, useMemo, useRef, useEffect } from 'react'
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

/* ── Smart result preview ── */
function resultPreview(result: string): string {
  const trimmed = result.trim()
  if (!trimmed) return ''

  // HTML → summarize
  if (trimmed.startsWith('<') || /<[a-z][\s>]/i.test(trimmed.slice(0, 100))) {
    const tags = trimmed.match(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)
    const unique = [...new Set((tags || []).map(t => t.replace(/<\/?/, '')))].slice(0, 5)
    return `HTML content (${unique.join(', ')}${(tags || []).length > 5 ? '…' : ''})`
  }

  // JSON → summarize
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return `JSON array with ${parsed.length} items`
      const keys = Object.keys(parsed)
      return `JSON object (${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '…' : ''})`
    } catch { /* not valid JSON */ }
  }

  // Plain text → first line or trunc
  const firstLine = trimmed.split('\n')[0]
  return firstLine.length > 80 ? firstLine.slice(0, 80) + '…' : firstLine
}

/* ── Human-friendly result renderer ── */
function SmartResult({ result }: { result: string }) {
  const trimmed = result.trim()

  // JSON → pretty table-like list
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
        return (
          <div className="hacktivity-result-table-wrap">
            <table className="hacktivity-result-table">
              <thead>
                <tr>{Object.keys(parsed[0]).map(k => <th key={k}>{k}</th>)}</tr>
              </thead>
              <tbody>
                {parsed.slice(0, 20).map((row, i) => (
                  <tr key={i}>{Object.values(row).map((v, j) => <td key={j}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 20 && <div className="hacktivity-result-more">…and {parsed.length - 20} more rows</div>}
          </div>
        )
      }
      // Simple JSON → pretty print
      return <pre className="hacktivity-pre hacktivity-result">{JSON.stringify(parsed, null, 2)}</pre>
    } catch { /* fall through */ }
  }

  // HTML → summary
  if (trimmed.startsWith('<') || /<[a-z][\s>]/i.test(trimmed.slice(0, 100))) {
    const textContent = trimmed.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const tags = trimmed.match(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)
    const unique = [...new Set((tags || []).map(t => t.replace(/<\/?/, '')))].slice(0, 8)
    return (
      <div className="hacktivity-result-html-summary">
        <div className="hacktivity-result-html-tags">
          <i className="fa-solid fa-code" /> Contains: {unique.join(', ')}
        </div>
        {textContent.length > 0 && (
          <pre className="hacktivity-pre hacktivity-result">{trunc(textContent, 500)}</pre>
        )}
      </div>
    )
  }

  // Plain text
  return <pre className="hacktivity-pre hacktivity-result">{trimmed}</pre>
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
  const [showTechDetails, setShowTechDetails] = useState(false)

  /* ── Search autocomplete state ── */
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Filtered conversations for autocomplete
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return hacktivityConversations
    const q = searchQuery.toLowerCase()
    return hacktivityConversations.filter(c =>
      (c.title || c.conversationId).toLowerCase().includes(q)
    )
  }, [hacktivityConversations, searchQuery])

  // Selected conversation label
  const selectedLabel = useMemo(() => {
    if (!selectedHacktivityConversationId) return ''
    const c = hacktivityConversations.find(x => x.conversationId === selectedHacktivityConversationId)
    return c ? (c.title || trunc(c.conversationId, 20)) : trunc(selectedHacktivityConversationId, 20)
  }, [selectedHacktivityConversationId, hacktivityConversations])

  function selectConversation(id: string | null) {
    onSelectConversation(id)
    onPageChange(1)
    onLoadHacktivity(1, id)
    setSearchQuery('')
    setSearchOpen(false)
  }

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
              <button className="hacktivity-back-btn" onClick={() => { onSelectHacktivityId(null); onSelectHacktivity(null); setShowTechDetails(false) }}>
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
              {/* "What happened" summary */}
              <div className="hacktivity-what-happened">
                <i className="fa-solid fa-circle-info" style={{ color: '#60a5fa' }} />
                <span>{getActionLabel(selectedHacktivity.toolArgs)}</span>
              </div>

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
                    <span className="hacktivity-meta-label">Tool</span>
                    <span className="hacktivity-meta-value">{(() => {
                      const name = (selectedHacktivity.toolArgs?.name ?? selectedHacktivity.toolArgs?.tool) as string | undefined
                      return name || '—'
                    })()}</span>
                  </div>
                </div>
              </div>

              {/* Technical details toggle */}
              <button
                className="hacktivity-tech-toggle"
                onClick={() => setShowTechDetails(v => !v)}
              >
                <i className={showTechDetails ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'} />
                {showTechDetails ? 'Hide' : 'Show'} technical details
              </button>

              {showTechDetails && (
                <div className="hacktivity-tech-details">
                  {selectedHacktivity.conversationId && (
                    <div className="hacktivity-tech-row">
                      <span className="hacktivity-tech-label">Conversation ID</span>
                      <code className="hacktivity-tech-value">{selectedHacktivity.conversationId}</code>
                    </div>
                  )}
                  {selectedHacktivity.id && (
                    <div className="hacktivity-tech-row">
                      <span className="hacktivity-tech-label">Action ID</span>
                      <code className="hacktivity-tech-value">{selectedHacktivity.id}</code>
                    </div>
                  )}
                </div>
              )}

              {/* Tool arguments */}
              {selectedHacktivity.toolArgs && Object.keys(selectedHacktivity.toolArgs).length > 0 && (
                <section className="hacktivity-section">
                  <h3 className="hacktivity-section-title">
                    <i className="fa-solid fa-gears" /> Parameters
                  </h3>
                  <div className="hacktivity-args-grid">
                    {Object.entries(selectedHacktivity.toolArgs).map(([k, v]) => {
                      // Skip 'name' and 'tool' keys since they're shown above
                      if (k === 'name' || k === 'tool') return null
                      const isNested = v !== null && typeof v === 'object'
                      const strVal = isNested ? JSON.stringify(v, null, 2) : String(v ?? '')
                      const isLong = !isNested && strVal.length > 100

                      // Friendly key names
                      const friendlyKey: Record<string, string> = {
                        command: 'Command',
                        target: 'Target',
                        url: 'URL',
                        host: 'Host',
                        port: 'Port',
                        path: 'File path',
                        content: 'Content',
                        message: 'Message',
                        query: 'Search query',
                        template: 'Template',
                        wordlist: 'Wordlist',
                        threads: 'Threads',
                        timeout: 'Timeout',
                      }

                      return (
                        <div key={k} className="hacktivity-arg-item">
                          <code className="hacktivity-arg-key">{friendlyKey[k] || k}</code>
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
                    <i className="fa-solid fa-clipboard-check" /> What happened
                  </h3>
                  {(() => {
                    const resultStr = String(selectedHacktivity.result).trim()
                    const isLong = resultStr.length > 300
                    return isLong ? (
                      <details className="hacktivity-result-details">
                        <summary className="hacktivity-result-summary">
                          <span className="hacktivity-result-preview">{resultPreview(resultStr)}</span>
                          <span className="hacktivity-result-toggle hacktivity-result-expand">
                            <i className="fa-solid fa-chevron-down" /> Expand
                          </span>
                          <span className="hacktivity-result-toggle hacktivity-result-collapse">
                            <i className="fa-solid fa-chevron-up" /> Collapse
                          </span>
                        </summary>
                        <SmartResult result={resultStr} />
                      </details>
                    ) : (
                      <SmartResult result={resultStr} />
                    )
                  })()}
                </section>
              )}

              {/* Empty result = action failed */}
              {(selectedHacktivity.result == null || String(selectedHacktivity.result).trim() === '') && (
                <section className="hacktivity-section">
                  <div className="hacktivity-failed-notice">
                    <i className="fa-solid fa-circle-exclamation" />
                    <span>This action didn't produce any output — it may have failed or timed out.</span>
                  </div>
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
                  {/* ── Search autocomplete ── */}
                  <div className="hacktivity-search" ref={searchRef}>
                    <div className="hacktivity-search-input-wrap">
                      <i className="fa-solid fa-magnifying-glass hacktivity-search-icon" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        className="hacktivity-search-input"
                        placeholder="Search conversations…"
                        value={searchOpen ? searchQuery : (selectedLabel || '')}
                        onFocus={() => { setSearchOpen(true); setSearchQuery('') }}
                        onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true) }}
                      />
                      {selectedHacktivityConversationId && (
                        <button
                          className="hacktivity-search-clear"
                          onClick={(e) => { e.stopPropagation(); selectConversation(null); searchInputRef.current?.blur() }}
                          title="Clear filter"
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                      )}
                    </div>
                    {searchOpen && (
                      <div className="hacktivity-search-dropdown">
                        <div
                          className={`hacktivity-search-option${!selectedHacktivityConversationId ? ' hacktivity-search-option--active' : ''}`}
                          onClick={() => selectConversation(null)}
                        >
                          <i className="fa-solid fa-list" />
                          <span>All conversations</span>
                          <span className="hacktivity-search-count">{hacktivityTotal}</span>
                        </div>
                        {filteredConversations.map((c) => (
                          <div
                            key={c.conversationId}
                            className={`hacktivity-search-option${selectedHacktivityConversationId === c.conversationId ? ' hacktivity-search-option--active' : ''}`}
                            onClick={() => selectConversation(c.conversationId)}
                          >
                            <i className="fa-solid fa-message" />
                            <span className="hacktivity-search-option-title">{trunc(c.title || c.conversationId, 35)}</span>
                            <span className="hacktivity-search-count">{c.count}</span>
                          </div>
                        ))}
                        {filteredConversations.length === 0 && searchQuery && (
                          <div className="hacktivity-search-empty">No conversations match "{searchQuery}"</div>
                        )}
                      </div>
                    )}
                  </div>

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
                    <i className="fa-solid fa-satellite-dish" />
                    <p>No activity yet</p>
                    <span>Start a pentest session and your AI agent's actions will show up here in real-time</span>
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
                        <div className="hacktivity-card-icon" style={{ background: color + '22', color, fontSize: '1.1rem' }}>
                          <i className={icon} />
                        </div>
                        <div className="hacktivity-card-body">
                          <div className="hacktivity-card-top">
                            <span className="hacktivity-card-action">
                              {getActionLabel(row.toolArgs)}
                              {error && (
                                <span className="hacktivity-error-badge">
                                  <i className="fa-solid fa-circle-exclamation" /> Failed
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
                              <span className="hacktivity-card-preview">{resultPreview(row.result)}</span>
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
