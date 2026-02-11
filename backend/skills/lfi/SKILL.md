---
name: lfi
description: "Path traversal / LFI — test file parameters with PoC paths (e.g. ../../../etc/passwd). report_finding when file content disclosed; POC = request + response snippet."
---

# LFI / Path Traversal Skill

## Purpose

Identify and verify Local File Inclusion (LFI) and path traversal. Use only proof-of-concept paths; no writes or destructive reads. **report_finding** required when content is disclosed.

## Preconditions

- Target in **SCOPE.md**.
- **memory_search** for target + "LFI" or "path traversal" to avoid duplicate testing.
- Identify file-influencing parameters: e.g. `file`, `path`, `document`, `include`, `page`.

## Vulnerability Class

LFI / path traversal — user input used in file paths (include, read, open) without sanitization.

## Detection Logic

1. Find parameters that might be used as file paths (query, form, cookie).
2. Probe with PoC payloads: `../../../etc/passwd`, `....//....//....//etc/passwd`, or Windows equivalents (e.g. `..\..\..\windows\win.ini`) only if scope includes Windows.
3. Observe response for file content (e.g. root:, [boot loader]).

## Verification Logic

- **exec**(curl with parameter set to traversal path) or **craft_payload** to issue request.
- Confirm when response contains expected file content (e.g. passwd lines, [boot loader]).

## Confirmation Criteria

- Response body contains content of a known file (e.g. /etc/passwd, win.ini). **report_finding** with **poc** = request (URL or param value) + response snippet showing disclosure.

## Proof Requirements (report_finding)

- **poc** must include: (1) parameter and payload used, (2) response snippet showing disclosed file content. Example: `Param: file=../../../etc/passwd | Response snippet: root:x:0:0:...`.

## Reporting Structure

- **detail**: LFI/path traversal, parameter, disclosed path, impact.
- **severity**: low / medium / high.
- **target**: URL and parameter.
- **poc**: Request + response snippet (required).

## Memory Logging (write_file)

- Path: **main** or **daily/website/YYYY-MM-DD**.
- Log: parameters tested, payloads used, result (confirmed / not found), checklist progress "LFI: done".

## Safety Rules

- Only read PoC files (e.g. /etc/passwd, win.ini). No writes, no overwrite attempts, no sensitive paths beyond PoC.
- In-scope only.

## When to Escalate or Pivot

- If WAF blocks traversal strings: try encoding (..%2f, %2e%2e/) or **memory_get**(path: "skills/waf-bypass/SKILL.md"); do not brute-force.
- If no LFI: log and move to next parameter or checklist area.

---

## THINK

- Which parameters suggest file inclusion (name contains file, path, doc, include, page)?
- Already tested (memory_search)? Retest only if new params or user asked.

## ACT

1. **memory_search**(query: target + "LFI" or "path traversal", max_results: 10).
2. For each file param: **exec**(curl "URL?param=../../../etc/passwd") or **craft_payload**; capture response.
3. If file content in response: **report_finding**(detail, severity, target, poc with request + response snippet).
4. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "LFI — [done/not found]. Params: ...").

## OBSERVE

- Response body for /etc/passwd format, [boot loader], or other known file content.
- Status code and error messages (path disclosed?).

## REFLECT

- Is proof in poc (payload + response snippet)? If not, do not mark done.
- All file-related parameters tested? Log and continue.

## LOG

- **write_file** after testing: params, result, checklist progress.
- **report_finding** for every confirmed LFI before marking phase done.
