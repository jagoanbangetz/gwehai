---
name: header-injection
description: "HTTP header injection — test X-Forwarded-Host, Host, etc. PoC only; report_finding when response reflects header or cache poisoning is evidenced; POC = header + response snippet."
---

# HTTP Header Injection Skill

## Purpose

Identify and verify HTTP header injection (e.g. X-Forwarded-Host, Host, X-Forwarded-Scheme) that can affect redirects, links, or cache. PoC only; no destructive or phishing use. **report_finding** required when header value is reflected in response or affects behavior.

## Preconditions

- Target in **SCOPE.md**.
- **memory_search** for target + "header injection" or "Host" to avoid duplicate testing.
- Identify endpoints that use Host/Forwarded headers (redirects, password reset, emails, cache).

## Vulnerability Class

HTTP header injection — user-controlled headers (e.g. X-Forwarded-Host, Host) used unsanitized in redirects, links, or responses.

## Detection Logic

1. Identify headers that might be trusted: X-Forwarded-Host, Host, X-Forwarded-Scheme, X-Original-URL, X-Rewrite-URL.
2. Send request with PoC value (in-scope host or safe domain).
3. Observe response: Location, Link, Content-Base, or body containing the header value.

## Verification Logic

- **exec**(curl -H "X-Forwarded-Host: example.com" URL) or **craft_payload** to set header.
- Confirm when response (header or body) contains or uses the supplied header value.

## Confirmation Criteria

- Response reflects header value in Location, Link, body, or cache. **report_finding** with **poc** = header name + value + response snippet showing reflection or behavior change.

## Proof Requirements (report_finding)

- **poc** must include: (1) header name and value used, (2) response snippet (Location, body, or link using that value). Example: `Header: X-Forwarded-Host: evil.com | Response: Location: https://evil.com/...`.

## Reporting Structure

- **detail**: Header injection, header name, impact (redirect/cache/email), steps to reproduce.
- **severity**: low / medium / high (context-dependent).
- **target**: URL and header.
- **poc**: Header + response snippet (required).

## Memory Logging (write_file)

- Path: **main** or **daily/website/YYYY-MM-DD**.
- Log: headers tested, result (confirmed / not found), checklist progress "Header injection: done".

## Safety Rules

- PoC values only (in-scope or example.com); no phishing domains unless user approved.
- In-scope only.

## When to Escalate or Pivot

- If multiple headers interact (Host + X-Forwarded-Host): test combination; log and report.
- If no reflection: log "not found" and move on.

---

## THINK

- Which endpoints use Host or forwarded headers (login redirect, password reset, links)?
- Already tested (memory_search)? Retest only if new endpoints or user asked.

## ACT

1. **memory_search**(query: target + "header injection" or "Host", max_results: 10).
2. For each endpoint: **exec**(curl -H "X-Forwarded-Host: example.com" URL) or **craft_payload**; capture response.
3. If header reflected or used in redirect/link: **report_finding**(detail, severity, target, poc with header + response).
4. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Header injection — [done/not found]. Headers: ...").

## OBSERVE

- Location, Link, Content-Base, or body containing the header value.
- Cache headers (e.g. Vary) that might enable poisoning.

## REFLECT

- Is proof in poc (header + response)? If not, do not mark done.
- Only safe PoC values used.

## LOG

- **write_file** after testing: headers, result, checklist progress.
- **report_finding** for every confirmed header injection before marking phase done.
