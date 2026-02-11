---
name: csrf
description: "CSRF on state-changing actions — craft request without Referer/Origin/CSRF token; report_finding when action succeeds; evidence = request + response."
---

# CSRF Skill

## Purpose

Test for Cross-Site Request Forgery: state-changing actions (password change, email change, transfer, delete) that succeed without a valid CSRF token or SameSite/Origin protection. PoC: single request without token; no destructive action (e.g. change to known test value).

## Preconditions

- Target in **SCOPE.md**.
- **memory_search**(query: target + "CSRF" or "state-changing") — avoid re-testing.
- **memory_get**(path: "SCOPE.md") to confirm scope.
- Identify state-changing endpoints (POST/PUT/DELETE) from recon or auth-journey; optional session cookie for authenticated CSRF.

## Inputs

- **target URL** (base URL).
- **Optional**: session cookies (from auth-journey or post-login-acl) for authenticated actions.
- **Optional**: list of state-changing endpoints and parameters (from recon).

## Workflow

### THINK

- Which actions change state (password, email, role, payment, delete)? Do they require CSRF token or custom header?
- Already tested (memory_search)? Retest only new endpoints or if user asked.
- Is target in SCOPE? Will PoC use harmless value (e.g. email to test@test.com)?

### ACT

1. **memory_search**(query: target + "CSRF", max_results: 10).
2. For each state-changing endpoint: **exec**(curl -X POST -b cookies.txt -d "param=harmless_value" "URL" -H "Referer: https://evil.com" -H "Origin: https://evil.com") or omit CSRF token if present in form. Omit Cookie only when testing pre-auth CSRF.
3. Observe: 200 + success message or state change = potential CSRF. **report_finding** with detail, severity, target, poc, evidence.
4. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Checklist progress: CSRF — tested: [endpoints]; result: confirmed/not found. Tested vectors: [list].").

### OBSERVE

- Status code; response body (success message, error "invalid token"); whether state actually changed (e.g. get profile after request).

### REFLECT

- Did action succeed without valid CSRF token / with forged Origin? If yes, proof must include request (no token or evil Origin) + response (success).
- Only harmless PoC (e.g. change email to test@test.com); no destructive state change.

### LOG

- **write_file**: "Tested vectors: [method, endpoint, with/without token, result]. Checklist progress: CSRF — done."
- **report_finding** for every confirmed CSRF before marking phase done.

## Confirmation criteria

- State-changing action succeeds when request is sent without valid CSRF token (or with Origin: evil.com / Referer: evil.com), using victim's session (or pre-auth if applicable).

## Proof requirements

- **poc**: Steps (e.g. "POST to /change-email without CSRF token, with Cookie") + request (curl or form) + response snippet (200 + success).
- **evidence**: Response snippet or HAR showing success; request must show missing token or forged Origin/Referer.

## Tool calls guidance

- **exec**: `curl -s -o - -w "%{http_code}" -X POST -b cookies.txt -d "email=test@test.com" "https://target.com/change-email" -H "Origin: https://evil.com"` — no CSRF token in body.
- **craft_payload**: Generate HTML form that POSTs to target (for documentation); do not host or trigger in real victim browser without scope.
- **write_file**: Path main or daily/website/YYYY-MM-DD; append "Tested vectors" and "Checklist progress".

## Safety limits

- **Stop**: 429, WAF, or lockout; log and continue. **PoC only**: use harmless value (test email, test string); do not delete real data or transfer real funds.
- **In-scope only**.

## Output fields for report_finding

- **title**: `CSRF — [action]` (e.g. "CSRF — Password change without token").
- **severity**: high for sensitive actions (password, email, payment); medium for lower-impact state change.
- **target**: Full URL of state-changing endpoint.
- **description**: Action tested, missing protection (token/Origin/SameSite), impact, steps to reproduce.
- **poc**: Steps + request (no token / forged Origin) + response snippet.
- **evidence**: Request/response snippet or HAR path.
