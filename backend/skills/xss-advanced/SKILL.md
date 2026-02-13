---
name: xss-advanced
description: "Advanced XSS — DOM-based, attribute/SVG/context bypass, mutation. Safe PoC only (e.g. alert(1)); report_finding with payload and evidence."
---

# XSS Advanced Skill (DOM, Context, Mutation)

## Purpose

Identify and verify **advanced XSS** variants: DOM-based XSS, attribute/SVG/context-specific injection, and mutation XSS where applicable. Use only safe PoC payloads (e.g. `alert(1)`). **report_finding** required when confirmed.

## Preconditions

- Target in user-defined scope (Pentest State).
- **memory_search**(query: target + "XSS" or "DOM XSS") — avoid duplicate testing.
- Inputs identified from enumeration (params, form fields, fragment, hash).

## Inputs

- **target URL** and endpoints with user-controlled input.
- **Parameters.discovered** and reflection points (query, body, fragment, DOM sinks).

## Safety Limits

- **PoC only**: no cookie theft or phishing payloads unless explicitly approved.
- **In-scope only**; stop on 429/WAF; no mass fuzzing.

## Workflow

### THINK

- Which inputs flow to DOM sinks (document.write, innerHTML, location, eval)?
- Which contexts are in use (HTML, attribute, SVG, script, style)?
- Already tested (memory_search)? Retest only new inputs or if user asked.

### ACT

1. **memory_search**(query: target + "XSS" or "DOM", max_results: 10).
2. **DOM-based**: Probe params that appear in fragment/hash or in client-side rendering; **exec**(curl) or **craft_payload** with payload in fragment; verify in response or documented DOM sink.
3. **Attribute/SVG/context**: Try context-appropriate payloads (e.g. `" onmouseover=alert(1)`, `"><svg/onload=alert(1)>`, `'-alert(1)-'`) in each reflected context.
4. If execution or unescaped reflection is evidenced: **report_finding**(detail, severity, target, poc with payload + evidence).
5. **write_file**(path: daily/<target>/<YYYY-MM-DD>, content: "XSS-advanced — DOM/context: [done/not found]. Inputs: ...").

### OBSERVE

- Response body for payload in attribute, SVG, or script context; DOM changes when fragment/params change.

### REFLECT

- Is proof in poc (payload + execution or unescaped reflection in context)? If not, do not mark done.

### LOG

- **write_file**: daily/<target>/<YYYY-MM-DD> — inputs tested, payloads, result, checklist progress.
- **report_finding** for every confirmed advanced XSS before marking done.

## Confirmation criteria

- Payload executes (e.g. alert) or appears unescaped in a dangerous context (attribute, SVG, DOM sink). **report_finding** with **poc** = payload + evidence.

## Proof requirements

- **poc**: payload used + evidence (execution or response/DOM snippet showing reflection in context).

## report_finding template

- **title**: `DOM/Context XSS — [location]`
- **severity**: low / medium / high
- **target**: URL and parameter or sink
- **detail**: DOM-based or context type, impact, steps to reproduce
- **poc**: Payload + proof (required)

## write_file logging format

- Path: **daily/<target>/<YYYY-MM-DD>**
- Content: Tested vectors (inputs, payloads, result); Checklist progress: "XSS-advanced — done."
