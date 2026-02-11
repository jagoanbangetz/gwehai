---
name: auth
description: "Authentication & session testing — registration, login, session, CSRF, password reset. PoC only; report_finding for each confirmed issue; POC = steps + evidence."
---

# Authentication & Session Skill

## Purpose

Identify and verify authentication and session weaknesses: registration flaws, login (enumeration, SQLi, default creds), session (predictability, cookie flags, fixation), CSRF on state-changing actions, password reset (token leakage, IDOR, host header). **report_finding** required for each confirmed issue.

## Preconditions

- Target in **SCOPE.md**.
- **memory_search** for target + "auth" or "session" or "login" to avoid duplicate testing.
- Identify registration, login, logout, password reset, and state-changing endpoints.

## Vulnerability Classes

- **Registration**: Duplicate registration, weak password policy, email verification bypass.
- **Login**: Username enumeration, SQLi in login (use sqlmap via exec), default creds.
- **Session**: Token predictability, cookie flags (HttpOnly, Secure), session fixation.
- **CSRF**: State-changing actions without token or same-site protection.
- **Password reset**: Token leakage, IDOR in reset link, host header injection.

## Detection Logic

1. **Registration**: Try duplicate email/username; try weak password; try bypassing email verification (e.g. response manipulation).
2. **Login**: Compare response for valid vs invalid user (enumeration); test login params with sqlmap (SQLi); try default creds if known.
3. **Session**: Check Set-Cookie for HttpOnly, Secure, SameSite; test session fixation (fix session id then login); check token format (predictable?).
4. **CSRF**: Identify state-changing POST; send request without Referer/Origin and without CSRF token; observe if action succeeds.
5. **Password reset**: Request reset; check if token in URL/response; try token for another user (IDOR); try X-Forwarded-Host in reset link.

## Verification Logic

- **exec**(curl for login/session/reset) or **craft_payload** to send requests. For SQLi in login: **exec**(sqlmap -u "login_url" --data "user=...&pass=..." --level=1 --risk=1 --batch).
- Confirm each class when evidence matches (e.g. enumeration: different message; CSRF: action succeeded without token).

## Confirmation Criteria

- Evidence of flaw (enumeration, SQLi, missing flags, fixation, CSRF, reset issue). **report_finding** per finding with **poc** = steps + evidence (request/response snippet).

## Proof Requirements (report_finding)

- **poc** must include: (1) steps to reproduce, (2) evidence (response diff, cookie header, or request that succeeded without token). Example: `Steps: POST login without CSRF token | Evidence: 200 + session cookie`.

## Reporting Structure

- **detail**: Auth/session issue type, location, impact, steps to reproduce.
- **severity**: low / medium / high (context-dependent).
- **target**: URL and endpoint.
- **poc**: Steps + evidence (required).

## Memory Logging (write_file)

- Path: **main** or **daily/website/YYYY-MM-DD**.
- Log: areas tested (registration, login, session, CSRF, reset), result per area (confirmed / not found), checklist progress "Auth: done".

## Safety Rules

- No credential stuffing, no brute-force; only PoC (e.g. one CSRF request, one enumeration check). Default creds only if public/list known.
- In-scope only.

## When to Escalate or Pivot

- If SQLi in login: **memory_get**(path: "skills/verify/SKILL.md") and use sqlmap; **report_finding** when confirmed.
- If reset token in URL: test IDOR with another user's token only if in scope and PoC; log and report.

---

## THINK

- Which auth flows exist (register, login, reset)? Which cookies/session tokens?
- Already tested (memory_search)? Retest only if new endpoints or user asked.

## ACT

1. **memory_search**(query: target + "auth" or "session" or "login", max_results: 10).
2. For registration: test duplicate, weak password, verification bypass; **report_finding** if confirmed.
3. For login: test enumeration, **exec**(sqlmap on login URL if params suspected), default creds; **report_finding** if confirmed.
4. For session: check cookie flags, test fixation; **report_finding** if confirmed.
5. For CSRF: send state-changing request without token; **report_finding** if action succeeds.
6. For reset: check token exposure, IDOR, host header; **report_finding** if confirmed.
7. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Auth — Registration: []; Login: []; Session: []; CSRF: []; Reset: []. Checklist progress: Auth done.").

## OBSERVE

- Response differences (enumeration), Set-Cookie headers, success of state-changing request without token, reset link content.

## REFLECT

- Is proof in poc for each finding? If not, do not mark that item done.
- All auth areas covered? Log and continue checklist.

## LOG

- **write_file** after testing: areas, result per area, checklist progress.
- **report_finding** for every confirmed auth/session issue before marking phase done.
