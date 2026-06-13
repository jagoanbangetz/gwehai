---
name: xss
description: "Reflected and Stored XSS testing — safe script payloads only (e.g. alert(1)). report_finding required when confirmed; POC must include payload and evidence script executed."
---

# XSS Skill (Reflected & Stored)

## Purpose

Identify and verify Reflected and Stored XSS. Use only proof-of-concept payloads (e.g. `<script>alert(1)</script>` or safe equivalent). **report_finding** required when confirmed.

## Preconditions

- Target in **SCOPE.md**.
- **memory_search** for target + "XSS" to avoid duplicate testing.
- Identify input points: query params, form fields (name, email, comment, etc.), headers.

## Vulnerability Class

- **Reflected XSS**: User input echoed in response without encoding.
- **Stored XSS**: User input stored and rendered later (e.g. comment, profile).

## Detection Logic

1. Inject safe payload in every user-controlled input (GET, POST, headers where reflected).
2. Check response (reflected) or reload page / view as another user (stored) for unescaped script.
3. Confirm only when script execution is evidenced (e.g. alert, or visible in DOM).

## Verification Logic

- **Reflected**: **exec** (curl with payload in param) or **craft_payload** (small script that sends request); inspect response for unescaped payload; if possible, evidence execution (e.g. alert).
- **Stored**: Submit payload to storage (comment, profile); reload or view as victim; evidence execution or unescaped reflection.

## Confirmation Criteria

- Payload appears in response unescaped (or script runs). **report_finding** with **poc** = payload + evidence (e.g. "alert(1) triggered" or response snippet showing reflection).

## Proof Requirements (report_finding)

- **poc** must include: (1) payload used, (2) evidence script executed or response snippet showing reflection. Example: `Payload: <script>alert(1)</script> | Proof: alert(1) triggered in browser` or response body snippet.

## Reporting Structure

- **detail**: Reflected or Stored XSS, location (parameter/page), impact, steps to reproduce.
- **severity**: low / medium / high (context-dependent).
- **target**: URL and parameter or form.
- **poc**: Payload + proof (required).

## Memory Logging (write_file)

- Path: **main** or **daily/website/YYYY-MM-DD**.
- Log: inputs tested, payloads used, result (confirmed reflected / confirmed stored / not found), checklist progress "XSS: done".

## Safety Rules

- No destructive or phishing payloads; only PoC (e.g. alert(1)). No cookie theft payloads unless user explicitly approved.
- In-scope only; no mass fuzzing without approval.

## Error Recovery & Fallback

### Primary Tool
**curl + browser** — send payloads via curl, verify execution in browser context.

### Fallback Tool
**craft_payload + manual inspection** — when curl/browser fails, build custom request scripts.

### Error Patterns & Recovery

| Error Pattern | Detection | Recovery Action |
|---|---|---|
| **Timeout** | curl hangs >30s, page won't load | Retry with `--connect-timeout 10 --max-time 20`. If still timeout, try different parameter or skip. |
| **Connection refused** | `curl: (7) Couldn't connect` | Skip input, log "target unreachable", move to next input. If all fail, escalate to user. |
| **WAF block** | HTTP 403/406, payload stripped from response | Pivot to **memory_get**(path: "skills/waf-bypass/SKILL.md"). Try: HTML entity encoding, mixed case (`<ScRiPt>`), event handlers (`onerror`), or SVG-based payloads. |
| **CSP blocks execution** | `Content-Security-Policy` header present, script won't execute | Still report if payload appears unescaped in response (note CSP in detail). Try inline event handlers or data URI as fallback vectors. |
| **Rate limit (429)** | HTTP 429 | Stop immediately, log tested inputs, report partial results. |
| **Payload filtered/encoded** | Payload appears HTML-encoded or stripped in response | Try encoding bypass: `&#x3C;script&#x3E;`, `%3Cscript%3E`, double encoding, or different tag vectors (`<img onerror=...>`, `<svg onload=...>`). |
| **No reflection found** | Payload never appears in response | Log input as "not reflected", move to next input. Don't retry same payload type. |

### Manual Fallback Workflow (when primary approach fails)
1. **exec**(curl -s "URL?param=<test123>") — check if input reflects at all.
2. If reflects: try **craft_payload** with encoded variants (`%3Cscript%3Ealert(1)%3C/script%3E`).
3. Try event handler vectors: `<img src=x onerror=alert(1)>`, `<svg/onload=alert(1)>`.
4. If nothing works after 3-4 vector types, log "not exploitable" and move on.

## When to Escalate or Pivot

- If WAF blocks: **memory_get**(path: "skills/waf-bypass/SKILL.md"); try minimal payloads.
- If CSP blocks execution: still report reflected/stored if payload appears in response unescaped (note CSP in detail).
- If all tools fail (timeout, crash, WAF): log error details, mark input as "skipped — tool failure", and move on. Never leave input unlogged.

---

## THINK

- Which parameters or form fields are reflected in response or stored and rendered?
- Already tested (memory_search)? Only retest new inputs or if user asked.

## ACT

1. **memory_search**(query: target + "XSS", max_results: 10).
2. For reflected: **exec**(curl with payload in param) or **craft_payload** to send request; capture response.
3. For stored: submit payload via form (comment/name/email); **exec** or browser flow to reload and check.
4. If confirmed: **report_finding**(detail, severity, target, poc with payload + proof).
5. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "XSS — Reflected/Stored: [done/not found]. Inputs: ...").

## OBSERVE

- Response body for unescaped `<script>`, `onerror=`, or other payload.
- Browser/context: did alert or equivalent fire?

## REFLECT

- Is proof in poc (payload + execution or reflection)? If not, do not mark done.
- All relevant inputs tested? Log and continue.

## LOG

- **write_file** after testing: inputs, result, checklist progress.
- **report_finding** for every confirmed XSS before marking phase done.
