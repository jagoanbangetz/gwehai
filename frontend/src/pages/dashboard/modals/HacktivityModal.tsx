import type { HacktivityRow, HacktivityConversationRow } from '../types'
import { formatReportTime } from '../utils'

/* ── Font Awesome icon mapping for hacktivity events ── */
const TOOL_ICON_MAP: Record<string, { icon: string; color: string }> = {
  // recon / scanning
  nuclei:          { icon: 'fa-solid fa-biohazard',       color: 'oklch(0.72 0.12 85)' },
  nikto:           { icon: 'fa-solid fa-spider',          color: 'oklch(0.72 0.12 85)' },
  nmap:            { icon: 'fa-solid fa-network-wired',   color: 'oklch(0.72 0.12 85)' },
  masscan:         { icon: 'fa-solid fa-satellite-dish',  color: 'oklch(0.72 0.12 85)' },
  subfinder:       { icon: 'fa-solid fa-satellite',       color: 'oklch(0.72 0.12 85)' },
  amass:           { icon: 'fa-solid fa-sitemap',         color: 'oklch(0.72 0.12 85)' },
  httpx:           { icon: 'fa-solid fa-arrow-right-arrow-left', color: 'oklch(0.72 0.12 85)' },
  whatweb:         { icon: 'fa-solid fa-fingerprint',     color: 'oklch(0.72 0.12 85)' },
  wappalyzer:      { icon: 'fa-solid fa-fingerprint',     color: 'oklch(0.72 0.12 85)' },
  // web fuzzing / dir discovery
  ffuf:            { icon: 'fa-solid fa-folder-tree',     color: 'oklch(0.75 0.12 280)' },
  gobuster:        { icon: 'fa-solid fa-folder-open',     color: 'oklch(0.75 0.12 280)' },
  dirb:            { icon: 'fa-solid fa-folder-open',     color: 'oklch(0.75 0.12 280)' },
  feroxbuster:     { icon: 'fa-solid fa-folder-tree',     color: 'oklch(0.75 0.12 280)' },
  // exploit / vuln
  sqlmap:          { icon: 'fa-solid fa-database',        color: 'oklch(0.68 0.18 25)' },
  metasploit:      { icon: 'fa-solid fa-skull-crossbones', color: 'oklch(0.68 0.18 25)' },
  xss:             { icon: 'fa-solid fa-bug',             color: 'oklch(0.68 0.18 25)' },
  sqli:            { icon: 'fa-solid fa-database',        color: 'oklch(0.68 0.18 25)' },
  lfi:             { icon: 'fa-solid fa-file-circle-exclamation', color: 'oklch(0.68 0.18 25)' },
  rce:             { icon: 'fa-solid fa-terminal',        color: 'oklch(0.68 0.18 25)' },
  ssrf:            { icon: 'fa-solid fa-arrow-up-right-from-square', color: 'oklch(0.68 0.18 25)' },
  // auth cracking
  hydra:           { icon: 'fa-solid fa-key',             color: 'oklch(0.75 0.14 300)' },
  medusa:          { icon: 'fa-solid fa-key',             color: 'oklch(0.75 0.14 300)' },
  john:            { icon: 'fa-solid fa-unlock-keyhole',  color: 'oklch(0.75 0.14 300)' },
  hashcat:         { icon: 'fa-solid fa-unlock-keyhole',  color: 'oklch(0.75 0.14 300)' },
  // pentest tools (LLM function calls)
  attack_chain:    { icon: 'fa-solid fa-link',            color: 'oklch(0.68 0.18 25)' },
  craft_payload:   { icon: 'fa-solid fa-bomb',            color: 'oklch(0.68 0.18 25)' },
  jwt_analyze:     { icon: 'fa-solid fa-key',             color: 'oklch(0.75 0.14 300)' },
  oob_test:        { icon: 'fa-solid fa-satellite-dish',  color: 'oklch(0.68 0.18 25)' },
  browser_action:  { icon: 'fa-solid fa-globe',           color: 'oklch(0.72 0.12 85)' },
  git_search:      { icon: 'fa-brands fa-git-alt',        color: 'oklch(0.72 0.12 85)' },
  // report / findings
  report_finding:  { icon: 'fa-solid fa-flag',            color: 'oklch(0.72 0.1 60)' },
  re_verify_findings: { icon: 'fa-solid fa-clipboard-check', color: 'oklch(0.72 0.1 60)' },
  // memory / notes
  memory_search:   { icon: 'fa-solid fa-brain',           color: 'oklch(0.72 0.1 60)' },
  memory_get:      { icon: 'fa-solid fa-brain',           color: 'oklch(0.72 0.1 60)' },
  global_memory:   { icon: 'fa-solid fa-brain',           color: 'oklch(0.72 0.1 60)' },
  write_file:      { icon: 'fa-solid fa-file-pen',        color: 'oklch(0.72 0.1 60)' },
  write_script:    { icon: 'fa-solid fa-file-code',       color: 'oklch(0.72 0.1 60)' },
  // session management
  sessions_spawn:  { icon: 'fa-solid fa-users-gear',      color: 'oklch(0.72 0.1 60)' },
  sessions_send:   { icon: 'fa-solid fa-paper-plane',     color: 'oklch(0.72 0.1 60)' },
  sessions_list:   { icon: 'fa-solid fa-list',            color: 'oklch(0.72 0.1 60)' },
  sessions_history:{ icon: 'fa-solid fa-clock-rotate-left', color: 'oklch(0.72 0.1 60)' },
  agents_list:     { icon: 'fa-solid fa-robot',           color: 'oklch(0.72 0.1 60)' },
  session_status:  { icon: 'fa-solid fa-circle-check',    color: 'oklch(0.72 0.1 60)' },
  add_skill:       { icon: 'fa-solid fa-book',            color: 'oklch(0.72 0.1 60)' },
  download_skill:  { icon: 'fa-solid fa-download',        color: 'oklch(0.72 0.1 60)' },
  download_agent:  { icon: 'fa-solid fa-robot',           color: 'oklch(0.72 0.1 60)' },
  exec:            { icon: 'fa-solid fa-terminal',        color: 'oklch(0.72 0.1 60)' },
  update_pentest_phase: { icon: 'fa-solid fa-arrows-spin', color: 'oklch(0.72 0.1 60)' },
}

const DEFAULT_ICON = { icon: 'fa-solid fa-terminal', color: 'oklch(0.67 0.005 60)' }

function getHacktivityIcon(toolArgs: Record<string, unknown> | null): { icon: string; color: string } {
  if (!toolArgs || typeof toolArgs !== 'object') return DEFAULT_ICON
  // Try direct tool name first (LLM function calls)
  const name = (toolArgs.name ?? toolArgs.tool) as string | undefined
  if (name) {
    const key = name.trim().toLowerCase()
    if (TOOL_ICON_MAP[key]) return TOOL_ICON_MAP[key]
  }
  // For exec tool, parse the command to find the actual CLI tool
  if (name === 'exec' && typeof toolArgs.command === 'string') {
    const cmd = toolArgs.command.trim().toLowerCase().split(/\s+/)[0]
    // strip path prefix (e.g. /usr/bin/nmap → nmap)
    const base = cmd.split('/').pop() || cmd
    if (TOOL_ICON_MAP[base]) return TOOL_ICON_MAP[base]
  }
  // Fallback: check command field directly
  if (typeof toolArgs.command === 'string') {
    const cmd = toolArgs.command.trim().toLowerCase().split(/\s+/)[0]
    const base = cmd.split('/').pop() || cmd
    if (TOOL_ICON_MAP[base]) return TOOL_ICON_MAP[base]
  }
  return DEFAULT_ICON
}

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content report-modal hacktivity-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header hacktivity-modal-header">
          <div>
            <h2 className="modal-title">
              {selectedHacktivity ? 'Action detail' : 'Hacktivity'}
            </h2>
            {!selectedHacktivity && (
              <p className="hacktivity-modal-subtitle">AI actions from your pentests — tools run, commands, and results.</p>
            )}
          </div>
          <div className="modal-header-actions">
            {selectedHacktivity && (
              <button
                type="button"
                className="report-back-btn hacktivity-back-btn"
                onClick={() => {
                  onSelectHacktivityId(null)
                  onSelectHacktivity(null)
                }}
              >
                ← Back to list
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
        <div className="modal-body hacktivity-modal-body">
          {selectedHacktivity ? (
            <div className="hacktivity-detail">
              <div className="hacktivity-detail-grid">
                <div className="hacktivity-detail-card">
                  <span className="hacktivity-detail-label">When</span>
                  <span className="hacktivity-detail-value">{formatReportTime(selectedHacktivity.createdAt)}</span>
                </div>
                {selectedHacktivity.domain && (
                  <div className="hacktivity-detail-card">
                    <span className="hacktivity-detail-label">Target / domain</span>
                    <span className="hacktivity-detail-value hacktivity-detail-domain" title={selectedHacktivity.domain}>{selectedHacktivity.domain}</span>
                  </div>
                )}
                {selectedHacktivity.conversationId && (
                  <div className="hacktivity-detail-card">
                    <span className="hacktivity-detail-label">Conversation</span>
                    <code className="hacktivity-detail-value hacktivity-detail-code" title={selectedHacktivity.conversationId}>{selectedHacktivity.conversationId.slice(0, 8)}…</code>
                  </div>
                )}
              </div>
              {selectedHacktivity.toolArgs && Object.keys(selectedHacktivity.toolArgs).length > 0 && (
                <section className="hacktivity-detail-section">
                  <h3 className="hacktivity-detail-section-title">What the AI did (arguments)</h3>
                  <div className="hacktivity-detail-args">
                    {Object.entries(selectedHacktivity.toolArgs).map(([k, v]) => (
                      <div key={k} className="hacktivity-detail-arg-row">
                        <span className="hacktivity-detail-arg-key">{k}</span>
                        <span className="hacktivity-detail-arg-val">
                          {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <details className="hacktivity-detail-raw">
                    <summary>View raw JSON</summary>
                    <pre className="hacktivity-detail-pre">{JSON.stringify(selectedHacktivity.toolArgs, null, 2)}</pre>
                  </details>
                </section>
              )}
              {selectedHacktivity.result != null && (
                <section className="hacktivity-detail-section">
                  <h3 className="hacktivity-detail-section-title">Result</h3>
                  <div className="hacktivity-detail-result-wrap">
                    <pre className="hacktivity-detail-pre hacktivity-detail-result">{selectedHacktivity.result}</pre>
                  </div>
                </section>
              )}
            </div>
          ) : (
            <>
              {loadError && (
                <div className="hacktivity-error-banner">
                  <span>{loadError}</span>
                  <button type="button" className="hacktivity-retry-btn" onClick={() => onLoadHacktivity(hacktivityPage, selectedHacktivityConversationId)}>
                    Retry
                  </button>
                </div>
              )}
              <div className="hacktivity-toolbar">
                <label className="hacktivity-filter-label">
                  Filter by conversation
                  <select
                    className="hacktivity-filter-select"
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
                        {c.title || c.conversationId.slice(0, 8) + '…'} ({c.count})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="report-table-container hacktivity-table-wrap">
                <table className="report-table hacktivity-table">
                  <thead>
                    <tr>
                      <th className="hacktivity-th-when">When</th>
                      <th className="hacktivity-th-action">Action</th>
                      <th className="hacktivity-th-target">Target / domain</th>
                      <th className="hacktivity-th-conv">Conversation</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={5} className="report-loading-cell">Loading hacktivity…</td>
                      </tr>
                    ) : hacktivityList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="report-empty-cell">No AI actions recorded yet. Run a pentest to see hacktivity here.</td>
                      </tr>
                    ) : (
                      hacktivityList.map((row) => (
                        <tr key={row.id} className="hacktivity-row">
                          <td className="hacktivity-when">{formatReportTime(row.createdAt)}</td>
                          <td className="hacktivity-action">
                            {(() => { const { icon, color } = getHacktivityIcon(row.toolArgs); return (
                              <span className="hacktivity-action-icon" style={{ color }}><i className={icon} /></span>
                            ) })()}
                            {getActionLabel(row.toolArgs)}
                          </td>
                          <td className="hacktivity-target" title={row.domain || ''}>{row.domain || '—'}</td>
                          <td className="hacktivity-conv" title={row.conversationId || ''}>{row.conversationId ? row.conversationId.slice(0, 8) + '…' : '—'}</td>
                          <td className="hacktivity-actions">
                            <button type="button" className="report-view-btn" onClick={() => {
                              onSelectHacktivityId(row.id)
                              onSelectHacktivity(row)
                            }}>
                              Detail
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="hacktivity-pagination">
                  <div className="hacktivity-pagination-buttons">
                    <button type="button" className="hacktivity-page-btn" disabled={hacktivityPage <= 1} onClick={() => {
                      const p = hacktivityPage - 1
                      onPageChange(p)
                      onLoadHacktivity(p, selectedHacktivityConversationId)
                    }}>
                      ‹ Prev
                    </button>
                    <span className="hacktivity-page-info">Page {hacktivityPage} of {totalPages}</span>
                    <button type="button" className="hacktivity-page-btn" disabled={hacktivityPage >= totalPages} onClick={() => {
                      const p = hacktivityPage + 1
                      onPageChange(p)
                      onLoadHacktivity(p, selectedHacktivityConversationId)
                    }}>
                      Next ›
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
