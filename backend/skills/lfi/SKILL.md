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

## Error Recovery & Fallback

### Primary Tool
**curl** — send traversal payloads directly via HTTP requests.

### Fallback Tool
**craft_payload + encoding variants** — when direct traversal fails, try encoded/obfuscated paths.

### Error Patterns & Recovery

| Error Pattern | Detection | Recovery Action |
|---|---|---|
| **Timeout** | curl hangs >30s | Retry with `--connect-timeout 10 --max-time 20`. If still timeout, skip parameter. |
| **Connection refused** | `curl: (7) Couldn't connect` | Skip parameter, log "target unreachable". If all fail, escalate to user. |
| **WAF block** | HTTP 403/406, "blocked", traversal stripped | Pivot to **memory_get**(path: "skills/waf-bypass/SKILL.md"). Try: `..%2f`, `%2e%2e/`, `..%252f`, `....//....//`, null byte `%00` (legacy). |
| **400/404 on traversal** | HTTP 400 or 404 with traversal path | Try fewer levels (`../` vs `../../../../`), try different target files (`/etc/hostname`, `/proc/self/environ`). |
| **Empty response** | 200 OK but no file content | Try: different file targets, add null byte, try path without leading `/` (e.g. `../../../etc/passwd` vs `/etc/passwd`). |
| **Rate limit (429)** | HTTP 429 | Stop, log tested params, report partial results. |
| **PHP wrapper needed** | Direct traversal returns empty | Try PHP wrappers: `php://filter/convert.base64-encode/resource=index`, `data://text/plain;base64,PD9waHA=`. |

### Manual Fallback Workflow (when direct traversal fails)
1. **exec**(curl -s "URL?file=../../../etc/passwd") — direct traversal.
2. If blocked: try **craft_payload** with encoding — `..%2f..%2f..%2fetc%2fpasswd`.
3. Try double encoding: `%252e%252e%252f` or `....//....//....//etc/passwd`.
4. Try PHP wrappers if target is PHP: `php://filter/convert.base64-encode/resource=config.php`.
5. If nothing works after 4-5 variants, log "not exploitable" and move on.

## When to Escalate or Pivot

- If WAF blocks traversal strings: try encoding (..%2f, %2e%2e/) or **memory_get**(path: "skills/waf-bypass/SKILL.md"); do not brute-force.
- If no LFI: log and move to next parameter or checklist area.
- If all tools fail (timeout, crash, WAF): log error details, mark parameter as "skipped — tool failure", and move on. Never leave parameter unlogged.

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
