---
name: idor
description: "IDOR — tamper user/id/document parameters to access other users' data. PoC only; report_finding with steps + response evidence."
---

# IDOR Skill

## Purpose

Test for Insecure Direct Object Reference: access another user's resource by tampering object identifiers (user id, order id, document id) in URL or body. PoC only; no mass enumeration.

## Preconditions

- Target in **SCOPE.md**. Do not run exec against out-of-scope URLs.
- **memory_search**(query: target + "IDOR" or "object reference") — avoid re-testing same endpoints.
- **memory_get**(path: "SCOPE.md") to confirm scope.
- Artifacts: optional cookies/HAR from post-login-acl or auth-journey for authenticated requests.

## Inputs

- **target URL** (base URL of app, e.g. https://target.com).
- **Optional**: session cookies or Cookie header for authenticated endpoints (from auth-journey / post-login-acl).
- **Optional**: list of object ids/endpoints from recon (e.g. /api/user/1, /orders/123).

## Workflow

### THINK

- Which endpoints expose object ids (user, order, document, report)? Check URL path and query/body.
- Did memory_search show prior IDOR testing on this target? If yes, only retest new endpoints or if user asked.
- Is target in SCOPE? If not, do not run exec.

### ACT

1. **memory_search**(query: target + "IDOR", max_results: 10).
2. Identify endpoints with id in path or body (e.g. GET /api/orders/123, GET /user/456).
3. With valid session (user A), **exec**(curl -b cookies.txt "BASE/api/orders/OTHER_USER_ID") or **craft_payload** to send request with tampered id.
4. Compare response: 200 + other user's data = IDOR. **report_finding** with detail, severity, target, poc, evidence.
5. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Checklist progress: IDOR — tested endpoints: ...; result: confirmed/not found. Tested vectors: [list].").

### OBSERVE

- HTTP status (200 vs 403/404); response body (data belonging to another user); headers (X-User-Id, etc.).

### REFLECT

- Is proof in poc (request with tampered id + response snippet showing other user's data)? If not, do not mark done.
- Only in-scope and PoC (one or two ids); no mass enumeration.

### LOG

- **write_file** after testing: "Tested vectors: [endpoint, id tested, result]. Checklist progress: IDOR — done."
- **report_finding** for every confirmed IDOR before marking phase done.

## Confirmation criteria

- Server returns 200 (or 2xx) with another user's data when requesting with tampered object id and valid session of user A.

## Proof requirements

- **poc**: Steps (e.g. "As user A, GET /api/orders/999 where 999 is user B's order") + request (URL or curl one-liner) + response snippet (status + body excerpt showing other user's data).
- **evidence**: Response snippet or HAR/screenshot reference; status code and body excerpt required.

## Tool calls guidance

- **exec**: `curl -s -o - -w "%{http_code}" -b cookies.txt "https://target.com/api/orders/OTHER_ID"` — capture status and body.
- **craft_payload**: Small script to loop over 2–3 ids (no mass); capture response and compare.
- **write_file**: Path main or daily/website/YYYY-MM-DD; append "Tested vectors" and "Checklist progress".

## Safety limits

- **Stop**: If 429/rate limit or WAF block; log and continue checklist. No brute-force id enumeration (max few ids for PoC).
- **In-scope only**: No exec on out-of-scope hosts.
- **PoC only**: Access only test accounts / in-scope object ids; no destructive actions.

## Output fields for report_finding

- **title**: `IDOR — [resource type] accessible via [parameter]` (e.g. "IDOR — order accessible via order_id").
- **severity**: high/critical if sensitive data; medium if limited data; low if minimal impact.
- **target**: Full URL or base + endpoint.
- **description** (or detail): Vulnerability type, location (endpoint + parameter), impact, steps to reproduce.
- **poc**: Steps + request (URL/curl) + response snippet (status + body excerpt).
- **evidence**: Response snippet or path to HAR/screenshot if saved (e.g. "HAR: artifacts/request_123.har").
