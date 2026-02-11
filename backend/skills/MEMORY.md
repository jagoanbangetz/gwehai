---
summary: "Template for main memory — web pentest long-term memory (stored in DB)"
read_when:
  - Bootstrapping a pentest agent workspace
---

# Main Memory (Web Security Agent)

Curated long-term memory for this engagement or operator. Stored in the database per conversation (key: **main**). **Only load in the main, private session.** Do not expose in shared or group contexts.

## In-Scope Targets (summary)

- (List key domains, IP ranges, or app names. Full details in SCOPE.md.)
- Example: `https://example.com` — web app, in scope.
- Example: `https://api.example.com` — API, in scope; no brute-force unless authorized.

## Critical Findings (summary)

- (High/critical issues worth remembering across sessions.)
- Example: Auth bypass on `/admin` — fixed as of 2026-01-15.
- Example: SQLi in search — reported; do not re-test without user saying so.

## Operator / Client Preferences

- (How the user likes to work: tools, severity thresholds, reporting style.)
- Example: Prefer OWASP Top 10 wording in findings.
- Example: Do not run automated scanners without explicit go-ahead.

## Tool & Scan Preferences

- (Preferred tools, limits, or constraints.)
- Example: Use browser for recon first; exec only for approved one-liners.
- Example: No fuzzing on production between 09:00–17:00 client time.

## Engagement Notes

- (Client name, contact, or constraints if needed for context. No secrets.)
- Example: Engagement ends 2026-02-28; all findings in memory/ and final report.

---

_Update when scope changes, critical findings are confirmed, or preferences change. Use write_file (path: main) for this; use path **daily/website/YYYY-MM-DD** (e.g. daily/example.com/2026-02-10) for per-site daily session notes and checklist progress. Memory is stored in the database (JSON); no .md files._
