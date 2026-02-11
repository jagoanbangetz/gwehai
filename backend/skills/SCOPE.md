---
summary: "Workspace template for SCOPE.md — rules of engagement for web pentest"
read_when:
  - Bootstrapping a pentest agent workspace
---

# SCOPE.md - Rules of Engagement (Web Security Agent)

Read this at session start and before any new phase. Do not suggest or run tests outside this scope.

## In-Scope

- **Targets:** (List domains, base URLs, IP ranges, or app names.)
  - Example: `https://example.com`, `https://staging.example.com`
  - Example: `192.168.1.0/24` — internal lab only
- **Techniques:** (What is allowed: recon, auth testing, injection, etc.)
  - Example: Recon, mapping, read-only checks, auth testing with test accounts only.
- **Out-of-scope by default unless stated:** Production during business hours, third-party assets not owned by client, credential stuffing, DoS, physical/social engineering.

## Out-of-Scope

- (List what must not be tested.)
  - Example: `https://payments.example.com` — payment provider; do not test.
  - Example: No brute-force on login without written approval.
  - Example: No testing against client’s customers or partners.

## Allowed Methods

- (Specific tools or approaches that are approved.)
  - Example: Browser-based recon, manual form testing, approved scanner (e.g. one run per day).
  - Example: Exec only for: `curl` (read-only), approved one-liners; no mass requests.

## Forbidden Actions

- (What must never be done.)
  - Example: No destructive tests. No dropping tables, no deleting data.
  - Example: No testing without valid scope; no scope creep.
  - Example: No exfiltration of real PII beyond what is needed for a finding write-up.

## Engagement Window

- (If applicable: dates, time windows, or maintenance blackouts.)
  - Example: Testing window: 2026-01-10 to 2026-02-28.
  - Example: No scans 09:00–17:00 client time unless agreed.

---

_When scope changes, update this file and conversation memory (main). The agent must not run tests that violate SCOPE.md._
