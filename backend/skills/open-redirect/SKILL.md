---
name: open-redirect
description: "Open redirect testing — test redirect/url/next parameters with PoC to in-scope or safe URL. report_finding when redirect to arbitrary URL is possible; POC = param + request/response."
---

# Open Redirect Skill

## Purpose

Identify and verify open redirect vulnerabilities (redirect/url/next/returnUrl parameters). Use only PoC redirects to in-scope or safe URLs; no phishing payloads. **report_finding** required when redirect to arbitrary URL is confirmed.

## Preconditions

- Target in **SCOPE.md**.
- **memory_search** for target + "open redirect" or "redirect" to avoid duplicate testing.
- Identify redirect-influencing parameters: redirect, url, next, returnUrl, return, goto, dest, etc.

## Vulnerability Class

Open redirect — application redirects user to user-controlled URL without validation.

## Detection Logic

1. Find parameters that influence redirect (login redirect, logout redirect, link shortener, etc.).
2. Probe with PoC: in-scope URL or safe external (e.g. https://example.com); then try full URL in param (e.g. https://evil.com if user approved, else only in-scope).
3. Observe Location header or 302/301 with user-controlled URL.

## Verification Logic

- **exec**(curl -I or curl -v with param set to redirect URL) or **craft_payload** to send request.
- Confirm when response Location header or body redirect points to the URL supplied in parameter.

## Confirmation Criteria

- Server responds with redirect (302/301) to the URL provided in parameter. **report_finding** with **poc** = parameter + request (e.g. param value) + response (Location or redirect target).

## Proof Requirements (report_finding)

- **poc** must include: (1) parameter and value used, (2) response snippet (Location header or redirect target). Example: `Param: redirect=https://example.com | Response: 302 Location: https://example.com`.

## Reporting Structure

- **detail**: Open redirect, parameter, impact (phishing, bypass), steps to reproduce.
- **severity**: low / medium (context-dependent).
- **target**: URL and parameter.
- **poc**: Parameter + response (required).

## Memory Logging (write_file)

- Path: **main** or **daily/website/YYYY-MM-DD**.
- Log: parameters tested, result (confirmed / not found), checklist progress "Open redirect: done".

## Safety Rules

- Do not use malicious or phishing URLs in PoC; use in-scope or known-safe URL (e.g. https://example.com). No credential harvesting.
- In-scope only.

## When to Escalate or Pivot

- If app whitelists domains: try path traversal in redirect (e.g. //evil.com) or subdomain; log and report if bypass found.
- If no redirect params: log "N/A" and move to next checklist area.

---

## THINK

- Which parameters control redirect (redirect, url, next, return)?
- Already tested (memory_search)? Retest only if new params or user asked.

## ACT

1. **memory_search**(query: target + "open redirect" or "redirect", max_results: 10).
2. For each redirect param: **exec**(curl -I "URL?param=https://example.com") or **craft_payload**; capture Location/redirect.
3. If redirect to supplied URL: **report_finding**(detail, severity, target, poc with param + response).
4. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Open redirect — [done/not found]. Params: ...").

## OBSERVE

- Location header, 302/301 status, meta refresh, or JavaScript redirect with param value.

## REFLECT

- Is proof in poc (param + redirect target)? If not, do not mark done.
- Only safe PoC URL used.

## LOG

- **write_file** after testing: params, result, checklist progress.
- **report_finding** for every confirmed open redirect before marking phase done.
