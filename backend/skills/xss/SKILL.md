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

## When to Escalate or Pivot

- If WAF blocks: **memory_get**(path: "skills/waf-bypass/SKILL.md"); try minimal payloads.
- If CSP blocks execution: still report reflected/stored if payload appears in response unescaped (note CSP in detail).

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
