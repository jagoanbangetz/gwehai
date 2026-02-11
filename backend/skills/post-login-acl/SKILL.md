---
name: post-login-acl
description: "Post-login ACL — use cookies/HAR from ui-flow or auth-journey to discover authenticated endpoints and test ACL/IDOR safely; report_finding per confirmed flaw."
---

# Post-Login ACL Skill

## Purpose

Discover authenticated endpoints (from HAR, links, or API docs) and test access control: IDOR (tamper id with authenticated session), privilege escalation (access admin with user cookie), horizontal/vertical access. **Use artifacts (cookies/HAR) from ui-flow or auth-journey** to perform authenticated requests safely. **report_finding** for each confirmed ACL/IDOR.

## Preconditions

- Target in **SCOPE.md**.
- **memory_search**(query: target + "post-login" or "ACL" or "authenticated") — avoid re-testing.
- **memory_get**(path: main or daily/website/YYYY-MM-DD) to **obtain artifact references**: cookies=..., HAR=... from ui-flow or auth-journey write_file. If no artifacts, run auth-journey or ui-flow first to get cookies/HAR.
- **memory_get**(path: "SCOPE.md") to confirm scope.

## Inputs

- **target URL** (base URL).
- **Artifacts**: cookies file path (e.g. artifactDir/cookies.json) or Cookie header value; HAR path (e.g. artifactDir/har.json) to discover authenticated endpoints (URLs from HAR entries).
- **Optional**: list of authenticated endpoints from recon if not using HAR.

## Workflow

### THINK

- Where are artifact paths logged? **memory_get**(path: main or daily/website/YYYY-MM-DD) and search for "Artifacts: cookies=" or "HAR=". Extract cookie header or cookies file path and HAR path.
- From HAR: which URLs are authenticated (status 200, sensitive paths like /api/user, /api/orders)? Build list of endpoints to test for IDOR/ACL.
- Already tested (memory_search)? Retest only new endpoints or if user asked.
- Is target in SCOPE?

### ACT

1. **memory_search**(query: target + "post-login" or "ACL", max_results: 10).
2. **memory_get**(path: main or daily/website/YYYY-MM-DD) — read last write_file content; find "Artifacts: cookies=..., HAR=...". If not found, **memory_get**(path: "skills/ui-flow/SKILL.md") or auth-journey and run flow to produce artifacts; then retry.
3. **Discover endpoints**: From HAR (parse JSON for request URL and method) or from recon list. Filter: same-origin, authenticated (e.g. /api/user, /api/orders, /admin). **craft_payload** to parse HAR and extract URLs if needed (30s).
4. **IDOR**: For each endpoint with id in path/body (e.g. /api/orders/123), **exec**(curl -b cookies.txt "BASE/api/orders/OTHER_ID") with session of user A. **report_finding** if 200 + other user's data.
5. **Privilege escalation**: **exec**(curl -b cookies.txt "BASE/admin/...") with low-priv cookie. **report_finding** if 200 on admin resource.
6. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Checklist progress: Post-login ACL — discovered: [N] endpoints; tested IDOR: []; escalation: []. Tested vectors: [list]. Artifacts used: cookies=..., HAR=....").

### OBSERVE

- Response status (200 vs 403); response body (other user's data vs forbidden); HAR entries (request URL, method, cookie present).

### REFLECT

- Is proof in poc (request with cookie + tampered id or admin path + response snippet)? If not, do not mark done.
- Only in-scope endpoints; only PoC (one or two ids, one admin path); no mass enumeration.

### LOG

- **write_file**: "Tested vectors: [endpoint, vector type, result]. Artifacts used: cookies=..., HAR=.... Checklist progress: Post-login ACL — done."
- **report_finding** for every confirmed ACL/IDOR before marking phase done.

## Confirmation criteria

- **IDOR**: Authenticated request with tampered object id returns 200 and another user's data.
- **Privilege escalation**: Low-priv session gains 200 on admin or elevated endpoint.

## Proof requirements

- **poc**: Request (URL, cookie used, tampered id or admin path) + response snippet (status + body excerpt).
- **evidence**: Response snippet or HAR path; cookie source (artifacts from ui-flow/auth-journey).

## Tool calls guidance

- **exec**: `curl -s -o - -w "%{http_code}" -b artifactDir/cookies.json "https://target.com/api/orders/999"` — or use -H "Cookie: name=value" if cookie string from HAR. Parse cookies.json if needed via **craft_payload**.
- **craft_payload**: Parse HAR JSON (e.g. node -e "const h=require('fs').readFileSync('artifactDir/har.json','utf8'); ...") to extract request URLs; 30s max.
- **write_file**: Path main or daily/website/YYYY-MM-DD; must log "Artifacts used: cookies=..., HAR=..." and "Tested vectors".

## Safety limits

- **Stop**: 429, WAF, or session expired; log and re-run auth flow if needed. No mass id enumeration (max few ids for PoC).
- **In-scope only**. Use only cookies/HAR from in-scope flows (ui-flow, auth-journey).

## Output fields for report_finding

- **title**: `Post-login ACL — [issue]` (e.g. "Post-login ACL — IDOR on /api/orders").
- **severity**: high/critical for IDOR or privilege escalation; medium for horizontal access.
- **target**: Full URL of endpoint (and tampered id or admin path).
- **description**: Issue type, endpoint, impact, steps to reproduce, artifacts used.
- **poc**: Request (cookie from artifacts + URL) + response snippet.
- **evidence**: Response snippet or HAR path; note "Cookies from ui-flow/auth-journey artifacts".
