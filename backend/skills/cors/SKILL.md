---
name: cors
description: "CORS — reflect Origin, allow credentials, wildcard with credentials. PoC only; report_finding with request + response headers evidence."
---

# CORS Skill

## Purpose

Test Cross-Origin Resource Sharing: (1) server reflects arbitrary Origin in Access-Control-Allow-Origin, (2) Access-Control-Allow-Credentials: true with reflected or broad Origin, (3) wildcard ACAO with credentials. PoC only; evidence = request Origin + response CORS headers.

## Preconditions

- Target in **SCOPE.md**.
- **memory_search**(query: target + "CORS") — avoid re-testing.
- **memory_get**(path: "SCOPE.md") to confirm scope.
- Identify API or same-origin endpoints that return CORS headers (from recon: curl -I or OPTIONS).

## Inputs

- **target URL** (base URL and API/same-origin endpoint that returns CORS headers).
- **Optional**: list of endpoints from recon that support CORS (OPTIONS or GET with Origin).

## Workflow

### THINK

- Which endpoints return CORS headers? (API, XHR, fetch). Do they reflect Origin or use wildcard?
- Already tested (memory_search)? Retest only new endpoints or if user asked.
- Is target in SCOPE?

### ACT

1. **memory_search**(query: target + "CORS", max_results: 10).
2. **exec**(curl -H "Origin: https://evil.com" -I "https://target.com/api/endpoint") — capture response headers: Access-Control-Allow-Origin, Access-Control-Allow-Credentials.
3. If ACAO reflects https://evil.com: **report_finding** (reflected Origin). If ACAO is * and ACAC is true: **report_finding** (invalid combination; some browsers may allow).
4. If ACAO reflects and ACAC is true: **report_finding** (credential theft from arbitrary origin). Include request Origin + response headers in poc.
5. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Checklist progress: CORS — tested: [endpoints]; result: confirmed/not found. Tested vectors: [list].").

### OBSERVE

- Access-Control-Allow-Origin (value: same as request Origin, *, or null); Access-Control-Allow-Credentials (true/false); Access-Control-Allow-Methods/Headers if OPTIONS.

### REFLECT

- Is proof in poc (request Origin: evil.com + response ACAO: https://evil.com or * with credentials)? If not, do not mark done.
- Only PoC (one evil Origin); no actual credential exfil.

### LOG

- **write_file**: "Tested vectors: [endpoint, Origin sent, ACAO/ACAC]. Checklist progress: CORS — done."
- **report_finding** for every confirmed CORS misconfiguration before marking phase done.

## Confirmation criteria

- Server responds with Access-Control-Allow-Origin set to attacker-controlled Origin (reflected) or wildcard * while Access-Control-Allow-Credentials is true (browser may allow credentials to be sent).

## Proof requirements

- **poc**: Request header (Origin: https://evil.com) + response headers (Access-Control-Allow-Origin, Access-Control-Allow-Credentials).
- **evidence**: Full response headers snippet or HAR.

## Tool calls guidance

- **exec**: `curl -s -I -H "Origin: https://evil.com" "https://target.com/api/user"` — capture all response headers.
- **exec**: `curl -s -X OPTIONS -H "Origin: https://evil.com" -H "Access-Control-Request-Method: GET" "https://target.com/api/user"` — for preflight.
- **write_file**: Path main or daily/website/YYYY-MM-DD; append "Tested vectors" and "Checklist progress".

## Safety limits

- **Stop**: 429 or WAF; log and continue. **PoC only**: one evil Origin; no actual cross-origin request from real victim browser unless scope allows.
- **In-scope only**.

## Output fields for report_finding

- **title**: `CORS — [issue]` (e.g. "CORS — Reflected Origin with credentials").
- **severity**: high if credentials allowed from arbitrary origin; medium if reflected without credentials; low if wildcard without credentials.
- **target**: Full URL of endpoint returning CORS headers.
- **description**: Misconfiguration (reflected/wildcard, credentials), impact, steps to reproduce.
- **poc**: Request Origin + response CORS headers.
- **evidence**: Response headers snippet or HAR.
