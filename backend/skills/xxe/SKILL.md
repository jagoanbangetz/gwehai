---
name: xxe
description: "XXE testing — only when XML endpoints exist (content-type application/xml). PoC only (e.g. file read to safe path); report_finding when entity expansion or file read is confirmed; POC = payload + response."
---

# XXE Skill

## Purpose

Identify and verify XML External Entity (XXE) in endpoints that accept XML (content-type application/xml or similar). Use only PoC payloads (e.g. read safe file or OOB ping if approved); no destructive or sensitive file reads. **report_finding** required when entity expansion or file read is confirmed.

## Preconditions

- Target in **SCOPE.md**.
- **memory_search** for target + "XXE" or "XML" to avoid duplicate testing.
- Confirm XML endpoint exists: request with Content-Type: application/xml; look for XML in request body.

## Vulnerability Class

XXE — XML parser resolves external entities; can lead to file read, SSRF, or DoS (entity expansion). Only test when XML is accepted.

## Detection Logic

1. Identify endpoints that accept XML (POST/PUT with application/xml).
2. Send PoC XXE payload: entity referencing a safe file (e.g. /etc/passwd) or parameter entity to echo back a string (no OOB unless user approved).
3. Observe response for file content or echoed data.

## Verification Logic

- **exec**(curl -X POST -H "Content-Type: application/xml" -d "@payload.xml" URL) or **craft_payload** to build and send XML.
- Confirm when response contains file content or entity-expanded data.

## Confirmation Criteria

- Response shows content of requested file or evidence of entity expansion. **report_finding** with **poc** = payload (sanitized) + response snippet.

## Proof Requirements (report_finding)

- **poc** must include: (1) simplified payload (entity definition + reference; no full sensitive file path if not needed), (2) response snippet showing file content or expansion. Example: `Payload: <!ENTITY x SYSTEM "file:///etc/passwd">... | Response: root:x:0:0...`.

## Reporting Structure

- **detail**: XXE, endpoint, impact (file read / SSRF / DoS), steps to reproduce.
- **severity**: medium / high / critical (context-dependent).
- **target**: URL and method.
- **poc**: Payload + response snippet (required).

## Memory Logging (write_file)

- Path: **main** or **daily/website/YYYY-MM-DD**.
- Log: endpoints tested, result (confirmed / not found / N/A no XML), checklist progress "XXE: done".

## Safety Rules

- Only PoC file reads (e.g. /etc/passwd) or safe echo; no writes, no SSRF to internal services unless in scope and approved. No billion laughs without user approval.
- In-scope only; test only endpoints that accept XML.

## When to Escalate or Pivot

- If XML not accepted: log "XXE: N/A (no XML endpoint)" and skip.
- If WAF blocks: try encoding or **memory_get**(path: "skills/waf-bypass/SKILL.md"); minimal payloads.

---

## THINK

- Are there endpoints with Content-Type: application/xml or that parse XML?
- Already tested (memory_search)? Retest only if new endpoints or user asked.

## ACT

1. **memory_search**(query: target + "XXE" or "XML", max_results: 10).
2. Identify XML endpoints; **exec**(curl with XML body) or **craft_payload** to send PoC XXE payload.
3. If file content or expansion in response: **report_finding**(detail, severity, target, poc with payload + response).
4. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "XXE — [done/not found/N/A]. Endpoints: ...").

## OBSERVE

- Response body for file content, entity-expanded text, or error messages revealing parser behavior.

## REFLECT

- Is proof in poc (payload + response)? If not, do not mark done.
- Only safe PoC used (no sensitive paths, no DoS).

## LOG

- **write_file** after testing: endpoints, result, checklist progress.
- **report_finding** for every confirmed XXE before marking phase done.
