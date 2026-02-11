---
name: auth-journey
description: "Authentication journey — registration, login, session, password reset. PoC only; report_finding per confirmed issue; evidence = request/response or HAR."
---

# Auth Journey Skill

## Purpose

Test the full authentication flow: registration (duplicate, weak policy, verification bypass), login (enumeration, SQLi, default creds), session (predictability, cookie flags, fixation), password reset (token leakage, IDOR, host header). **report_finding** for each confirmed issue.

## Preconditions

- Target in **SCOPE.md**.
- **memory_search**(query: target + "auth" or "login" or "registration") — avoid duplicate testing.
- **memory_get**(path: "SCOPE.md") to confirm scope.
- No destructive actions; PoC only (e.g. one duplicate registration attempt, one enumeration check).

## Inputs

- **target URL** (base URL, e.g. https://target.com).
- **Optional**: test credentials (if user provided); email domain rules (e.g. @allowed.com for registration).
- **Optional**: list of auth endpoints from recon (/register, /login, /forgot-password).

## Workflow

### THINK

- Which auth flows exist (register, login, logout, forgot-password, reset)? Which cookies are set (session, refresh)?
- Already tested (memory_search)? Retest only new endpoints or if user asked.
- Is target in SCOPE?

### ACT

1. **memory_search**(query: target + "auth" or "login", max_results: 10).
2. **Registration**: **exec**(curl -X POST form to /register with duplicate email or weak password); observe response. **report_finding** if duplicate accepted or verification bypassed.
3. **Login**: **exec**(curl -X POST to /login with valid vs invalid user); compare messages (enumeration). For SQLi: **exec**(sqlmap -u "LOGIN_URL" --data "user=...&pass=..." --level=1 --risk=1 --batch). **report_finding** if enumeration or SQLi confirmed.
4. **Session**: **exec**(curl -I login response); check Set-Cookie for HttpOnly, Secure, SameSite. Test fixation: fix session id, then login; check if session id changes. **report_finding** if flags missing or fixation works.
5. **Password reset**: Request reset; check token in URL/email; **exec**(curl reset link with X-Forwarded-Host); **report_finding** if token in URL or host header reflected.
6. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Checklist progress: Auth journey — Registration: []; Login: []; Session: []; Reset: []. Tested vectors: [list].").

### OBSERVE

- Registration: duplicate accepted? Verification skipped? Login: different message for valid vs invalid user? Session: cookie flags, session id change after login? Reset: token location, host header in link?

### REFLECT

- Is proof in poc for each finding (request + response snippet)? If not, do not mark that item done.
- Only PoC (no credential stuffing, no brute-force).

### LOG

- **write_file** after each sub-phase: "Tested vectors: [endpoint, vector, result]. Checklist progress: Auth — [section] done."
- **report_finding** for every confirmed auth issue before marking phase done.

## Confirmation criteria

- **Registration**: Duplicate email accepted; or weak password accepted; or email verification bypassed (e.g. response manipulation).
- **Login**: Different response for valid vs invalid username (enumeration); or sqlmap confirms SQLi; or default creds work.
- **Session**: Missing HttpOnly/Secure/SameSite; or session id does not change after login (fixation).
- **Reset**: Token in URL or response; or reset link uses attacker-controlled host (X-Forwarded-Host); or token for user B works when used by user A (IDOR).

## Proof requirements

- **poc**: Steps to reproduce + request (e.g. POST body or curl) + response snippet (status, body or headers).
- **evidence**: Response snippet or HAR/screenshot path; for session include Set-Cookie excerpt.

## Tool calls guidance

- **exec**: `curl -v -X POST -d "email=test@test.com&password=weak" "https://target.com/register"` — capture status and body.
- **exec**: `sqlmap -u "https://target.com/login" --data "user=u&pass=p" --level=1 --risk=1 --batch` — only in-scope and PoC.
- **write_file**: Path main or daily/website/YYYY-MM-DD; append "Tested vectors" and "Checklist progress".

## Safety limits

- **Stop**: 429, lockout message, CAPTCHA, or WAF block; log and continue. No brute-force; no credential stuffing.
- **In-scope only**. **PoC only**: one or two requests per vector.

## Output fields for report_finding

- **title**: `Auth — [issue type]` (e.g. "Auth — Username enumeration on login").
- **severity**: high for SQLi/default creds; medium for enumeration/session flags; low for weak policy.
- **target**: Login/register/reset URL.
- **description**: Issue type, location, impact, steps to reproduce.
- **poc**: Steps + request + response snippet.
- **evidence**: Response snippet or HAR/screenshot path.
