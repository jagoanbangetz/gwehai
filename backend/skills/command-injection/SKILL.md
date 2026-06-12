---
name: command-injection
description: "Command injection testing — probe inputs that might be passed to shell; PoC only (e.g. id, whoami). report_finding when command output appears in response; POC = payload + response snippet."
---

# Command Injection Skill

## Purpose

Identify and verify command injection where user input is passed to OS commands. Use only safe PoC commands (e.g. `id`, `whoami`, `echo`); no destructive or data-exfil commands. **report_finding** required when output is observed.

## Preconditions

- Target in **SCOPE.md**.
- **memory_search** for target + "command injection" or "RCE" to avoid duplicate testing.
- Identify inputs that might be executed: ping, nslookup, file upload names, form fields that look like commands.

## Vulnerability Class

Command injection / OS command injection — unsanitized input passed to shell (system, exec, popen, etc.).

## Detection Logic

1. Identify parameters that might be used in commands (e.g. IP for ping, hostname for nslookup, filename, search).
2. Probe with safe PoC: `; id`, `| id`, `$(id)`, `` `id` ``, `& id` (context-dependent; one at a time).
3. Observe response for command output (e.g. uid=, whoami result).

## Verification Logic

- **exec**(curl with payload in param) or **craft_payload** to send request.
- Confirm when response contains output of PoC command (e.g. uid=, hostname).

## Confirmation Criteria

- Response body contains output of injected command. **report_finding** with **poc** = payload used + response snippet showing command output.

## Proof Requirements (report_finding)

- **poc** must include: (1) payload used (e.g. `; id`), (2) response snippet showing command output. Example: `Payload: ; id | Response: uid=33(www-data)...`.

## Reporting Structure

- **detail**: Command injection, parameter, impact (e.g. RCE), steps to reproduce.
- **severity**: high / critical typically.
- **target**: URL and parameter.
- **poc**: Payload + response snippet (required).

## Memory Logging (write_file)

- Path: **main** or **daily/website/YYYY-MM-DD**.
- Log: parameters tested, payloads used, result (confirmed / not found), checklist progress "Command injection: done".

## Safety Rules

- Only PoC commands: id, whoami, echo, uname. No rm, no curl to external servers, no reverse shells, no credential access.
- In-scope only; one request per payload to confirm.

## Error Recovery & Fallback

### Primary Tool
**curl** — send injection payloads via HTTP requests.

### Fallback Tool
**craft_payload + delimiter/encoding variants** — when direct injection fails, try different separators and encodings.

### Error Patterns & Recovery

| Error Pattern | Detection | Recovery Action |
|---|---|---|
| **Timeout** | curl hangs >30s (possible blind RCE or sleep) | Retry with `--connect-timeout 10 --max-time 20`. If timeout with sleep payload, note as potential blind RCE. |
| **Connection refused** | `curl: (7) Couldn't connect` | Skip parameter, log "target unreachable". If all fail, escalate to user. |
| **WAF block** | HTTP 403/406, payload blocked | Pivot to **memory_get**(path: "skills/waf-bypass/SKILL.md"). Try: URL-encode special chars (`%3B`, `%7C`, `%26`), use `${IFS}` instead of spaces, or backtick variants. |
| **Command output suppressed** | 200 OK but no command output in response | Try time-based: `; sleep 5` or `| ping -c 3 127.0.0.1` and measure response time. Try out-of-band (DNS/HTTP callback) if available. |
| **Rate limit (429)** | HTTP 429 | Stop, log tested params, report partial results. |
| **Filter blocks delimiters** | `;`, `|`, `&` characters stripped | Try alternative separators: `%0a` (newline), `||`, `&&`, backticks, `$()`. Try without spaces: `;id` or `\n id`. |
| **No output channel** | Injection works (time-based confirms) but no output visible | Note as "blind command injection". Report with time-based evidence. Suggest user approve DNS callback for full confirmation. |

### Manual Fallback Workflow (when direct injection fails)
1. **exec**(curl -s "URL?ip=127.0.0.1; id") — semicolon separator.
2. **exec**(curl -s "URL?ip=127.0.0.1 | id") — pipe separator.
3. **exec**(curl -s "URL?ip=127.0.0.1%0aid") — newline separator.
4. Try **craft_payload** with: `$(id)`, `` `id` ``, `${IFS}id`, URL-encoded variants.
5. Time-based fallback: `; sleep 5` — measure response delta.
6. If nothing works after 5-6 variants, log "not exploitable" and move on.

## When to Escalate or Pivot

- If response suggests injection but no output: try different delimiter or encoding; log as potential and escalate to user.
- If WAF blocks: **memory_get**(path: "skills/waf-bypass/SKILL.md"); minimal payloads only.
- If all tools fail (timeout, crash, WAF): log error details, mark parameter as "skipped — tool failure", and move on. Never leave parameter unlogged.

---

## THINK

- Which inputs are likely passed to shell (ping, nslookup, file operations, system)?
- Already tested (memory_search)? Retest only if new params or user asked.

## ACT

1. **memory_search**(query: target + "command injection" or "RCE", max_results: 10).
2. For each candidate param: **exec**(curl with payload) or **craft_payload**; capture response.
3. If command output in response: **report_finding**(detail, severity, target, poc with payload + response snippet).
4. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Command injection — [done/not found]. Params: ...").

## OBSERVE

- Response for uid=, whoami, hostname, or other PoC command output.
- Error messages that might reveal command execution.

## REFLECT

- Is proof in poc (payload + output)? If not, do not mark done.
- Only safe PoC used? No destructive commands.

## LOG

- **write_file** after testing: params, result, checklist progress.
- **report_finding** for every confirmed command injection before marking phase done.
