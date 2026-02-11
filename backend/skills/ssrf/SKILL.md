---
name: ssrf
description: "SSRF — user-controlled URL/fetch to internal or external host. PoC only (e.g. callback to in-scope URL or allowed host); report_finding with request + response evidence."
---

# SSRF Skill

## Purpose

Test for Server-Side Request Forgery: parameters that trigger server-side HTTP/HTTPS requests (webhook URL, fetch URL, import URL, callback). Confirm ability to control destination (internal or external). PoC only; no access to internal secrets or destructive calls.

## Preconditions

- Target in **SCOPE.md**.
- **memory_search**(query: target + "SSRF" or "webhook" or "fetch URL") — avoid re-testing.
- **memory_get**(path: "SCOPE.md") to confirm scope; note any allowed callback/outbound rules.
- Identify parameters that might trigger server fetch: url, webhook, callback, fetch, import, redirect.

## Inputs

- **target URL** (base URL).
- **Optional**: in-scope callback URL or user-approved external host for PoC (e.g. https://example.com or requestbin).
- **Optional**: list of endpoints with URL parameters from recon.

## Workflow

### THINK

- Which endpoints accept URL/webhook/callback/fetch and trigger server-side request? (Import, webhook, avatar URL, PDF generator, etc.)
- Already tested (memory_search)? Retest only new endpoints or if user asked.
- Is target in SCOPE? PoC destination in scope or explicitly allowed (no internal IPs unless scope allows).

### ACT

1. **memory_search**(query: target + "SSRF" or "webhook", max_results: 10).
2. For each candidate parameter: **exec**(curl -X POST -d "url=https://allowed-callback.com" "ENDPOINT") or **craft_payload** to send URL; use in-scope or user-approved host only.
3. Observe: server fetches our URL (callback received, timing, error message revealing fetch). For internal: use only if scope allows (e.g. metadata URL); no access to sensitive internal services.
4. **report_finding** when server-side request to attacker-controlled URL is confirmed; include request + response/callback evidence.
5. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Checklist progress: SSRF — tested: [endpoints]; result: confirmed/not found. Tested vectors: [list].").

### OBSERVE

- Callback received; response body (e.g. "fetched", "error connecting to..."); timing; error messages that leak internal hostnames or scheme.

### REFLECT

- Is proof in poc (parameter + value + evidence server made request)? If not, do not mark done.
- No internal IP or cloud metadata unless explicitly in scope and PoC-safe.

### LOG

- **write_file**: "Tested vectors: [endpoint, param, value, result]. Checklist progress: SSRF — done."
- **report_finding** for every confirmed SSRF before marking phase done.

## Confirmation criteria

- Server performs an HTTP/HTTPS request to a URL controlled by the attacker (e.g. callback received, or response reflects fetched content/internal error).

## Proof requirements

- **poc**: Parameter name + value (URL used) + evidence (callback log, response snippet, or error message showing fetch).
- **evidence**: Response snippet or callback log; for blind SSRF, timing or out-of-band callback reference.

## Tool calls guidance

- **exec**: `curl -s -X POST -d "webhook=https://your-callback.com" "https://target.com/api/webhook"` — use in-scope or approved callback only.
- **craft_payload**: Small script to start local listener or use requestbin; 30s max; document only if safe.
- **write_file**: Path main or daily/website/YYYY-MM-DD; append "Tested vectors" and "Checklist progress".

## Safety limits

- **Stop**: Do not probe internal IPs (127.0.0.1, 169.254.169.254) unless scope explicitly allows and PoC is non-destructive. No access to cloud metadata or internal services without approval.
- **PoC only**: Use in-scope or user-approved callback host; no data exfil, no destructive request.
- **In-scope only**.

## Output fields for report_finding

- **title**: `SSRF — [parameter/endpoint]` (e.g. "SSRF — Webhook URL triggers server fetch").
- **severity**: critical/high if internal network or metadata; medium if external only.
- **target**: Full URL of endpoint with parameter.
- **description**: Parameter, impact (internal/external fetch), steps to reproduce.
- **poc**: Parameter + URL value + evidence (callback/response).
- **evidence**: Callback log or response snippet.
