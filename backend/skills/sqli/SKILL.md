---
name: sqli
description: "SQL injection testing — parameter fuzzing, verification with sqlmap (allowlisted). report_finding required when confirmed; POC must include payload and proof (DB name or response snippet)."
---

# SQL Injection Skill

## Purpose

Identify and verify SQL injection in web parameters. Use allowlisted tools only; proof-of-concept only. **report_finding** is required when confirmed; do not mark phase done without it.

## Preconditions

- Target is explicitly in-scope per user instructions and Pentest State (daily/<target>/<YYYY-MM-DD>). No testing against out-of-scope assets.
- **memory_search** for target + "SQLi" / "injection" to avoid duplicate testing.
- **memory_get**(path: "skills/verify/SKILL.md") if you need verification rules.

## Vulnerability Class

SQL injection — unsanitized user input in SQL queries (GET/POST/cookies/headers), including:

- **Error-based SQLi** — database errors or verbose messages in responses.
- **Union-based SQLi** — injected `UNION SELECT` to read data.
- **Boolean-based blind SQLi** — different responses for logically true vs false conditions.
- **Time-based blind SQLi** — response time differences using sleep/benchmark functions.

## Detection Logic

1. **Identify candidates**
   - Parameters in query strings, POST bodies, JSON, cookies, and sometimes headers (e.g. `X-User-Id`).
   - Prior recon/enum output listing DB-like params (`id`, `user`, `product_id`, `search`, `q`, etc.).

2. **Initial probes (non-destructive)**
   - For each candidate parameter:
     - Numeric context: try `1'`, `1"`, `1--`, `1#`.
     - String context: try `test'`, `test"`, `test'--`.
   - Observe:
     - HTTP status changes (200 vs 500/4xx).
     - Error messages mentioning SQL/DB (syntax error, MySQL, PostgreSQL, SQLServer, Oracle, etc.).

3. **Error-based hints**
   - Look for:
     - `SQL syntax;` / `near '` / `unclosed quotation mark after the character string`.
     - DB engine names (`MySQL`, `PostgreSQL`, `SQL Server`, `Oracle`, `SQLite`).
   - If present, treat the parameter as **highly suspicious**.

4. **Boolean-based blind hints**
   - For at most a few safe checks per parameter:
     - True condition: e.g. `1 AND 1=1`, `1' AND '1'='1'`.
     - False condition: e.g. `1 AND 1=2`, `1' AND '1'='2'`.
   - Compare:
     - Response length / structure.
     - Presence/absence of key text.
   - Consistent difference between true vs false suggests **boolean-based blind SQLi**.

5. **Time-based blind hints (very limited)**
   - Only a couple of safe tests per parameter; do not loop or use long sleeps.
   - Example payloads (adapt per DB type when known):
     - `1 AND SLEEP(5)` (MySQL)
     - `1; SELECT pg_sleep(5)--` (PostgreSQL)
   - If response time for the time-based payload is significantly and repeatedly higher than baseline, treat it as **time-based blind SQLi**.

## Verification Logic

- Use **exec** with **sqlmap** for confirmation (error-based, boolean-based, and time-based) instead of relying only on manual curl tests.
- Basic safe verification:
  - `sqlmap -u "FULL_URL" --level=1 --risk=1 --batch`
- When you know the suspected parameter:
  - `sqlmap -u "FULL_URL_WITH_PARAM=VALUE" -p "PARAM_NAME" --level=1 --risk=1 --batch`
- For blind SQLi (boolean/time-based), you may allow sqlmap to use blind techniques but keep risk/level low:
  - `sqlmap -u "FULL_URL_WITH_PARAM=VALUE" -p "PARAM_NAME" --level=1 --risk=1 --batch --technique=BEUST`
- Confirm when:
  - sqlmap reports the injection type (error-based/boolean/time/unioned) and shows extracted info (DB name, version, table names, sample rows), **or**
  - Manual controlled tests show consistent error/boolean/time-based behavior with clear evidence.

## Confirmation Criteria

- Tool or response shows database type/name/version or data extraction.
- **report_finding** called with **poc** containing payload AND proof (DB name or response snippet).

## Proof Requirements (report_finding)

- **poc** must include: (1) the payload used, (2) concrete proof from response or sqlmap output (e.g. "current database: 'acuart'" or response snippet with DB version).
- Example: `Payload: id=1' UNION SELECT 1,@@version-- | Response: MySQL 5.7.33` or `sqlmap output: current database: 'acuart'`.

## Reporting Structure

- **detail**: Vulnerability type (SQLi), parameter, impact, steps to reproduce.
- **severity**: low / medium / high / critical.
- **target**: URL and parameter.
- **poc**: As above (required).

## Memory Logging (write_file)

- Path: **main** or **daily/website/YYYY-MM-DD** (e.g. daily/target.com/2026-02-10).
- Log: parameters tested, URLs tested, result (confirmed / not confirmed / skipped), checklist progress line "SQLi: done" or "SQLi: not applicable".

## Safety Rules

- Only in-scope targets. No DROP TABLE, no destructive payloads, no mass extraction without user approval.
- Proof-of-concept only; use sqlmap with `--level=1 --risk=1` and short time-based tests unless the user explicitly approves more aggressive settings.

## Error Recovery & Fallback

### Primary Tool
**sqlmap** — automated SQLi detection and verification.

### Fallback Tool
**curl + manual payloads** — when sqlmap fails, test manually with crafted requests.

### Error Patterns & Recovery

| Error Pattern | Detection | Recovery Action |
|---|---|---|
| **Timeout** | sqlmap hangs >60s, no response | Kill sqlmap, retry with `--timeout=10 --retries=2`. If still timeout, switch to manual curl with single payload per request. |
| **Connection refused** | `curl: (7) Couldn't connect` or sqlmap `connection refused` | Skip parameter, log "target unreachable", move to next parameter. If all params fail, escalate to user. |
| **WAF block** | HTTP 403/406, "blocked" in response, sqlmap `WAF/IPS` | Pivot to **memory_get**(path: "skills/waf-bypass/SKILL.md"). Try: URL-encode payloads, use `--tamper=space2comment`, or manual curl with minimal payloads. |
| **Rate limit (429)** | HTTP 429, `Too Many Requests` | Stop immediately, log remaining params, report partial results. Wait or skip to next target. |
| **sqlmap crash** | Process exits unexpectedly | Retry once with `--fresh` flag. If crash again, switch to manual curl + craft_payload approach. |
| **False positive doubt** | sqlmap says injectable but manual test inconclusive | Run manual verification: curl with true/false conditions, compare response length/body. Only report if manual test confirms. |

### Manual Fallback Workflow (when sqlmap unavailable or failing)
1. **exec**(curl -s "URL?param=1'" ) — check for SQL errors in response.
2. **exec**(curl -s "URL?param=1 AND 1=1" vs "URL?param=1 AND 1=2") — boolean diff.
3. **exec**(curl -s "URL?param=1 AND SLEEP(3)") — time-based check (timeout=10s).
4. If any pattern matches, **craft_payload** for deeper verification or escalate to user.

## When to Escalate or Pivot

- If WAF blocks sqlmap: pivot to **memory_get**(path: "skills/waf-bypass/SKILL.md") or try craft_payload with minimal curl probes; do not brute-force WAF.
- If no injection found: log and move to next parameter or next checklist area; do not mark "SQLi confirmed" without report_finding.
- If all tools fail (timeout, crash, WAF): log error details, mark parameter as "skipped — tool failure", and move on. Never leave parameter unlogged.

---

## THINK

- Which parameters (query, body, cookie) might reach the database?
- Did memory_search show prior SQLi testing on this target? If yes, only retest if new parameters or user asked.
- Is target in SCOPE? If not, do not run exec.

## ACT

1. **memory_search**(query: target + "SQLi" or "injection", max_results: 10).
2. **memory_get**(path: "skills/verify/SKILL.md") if needed.
3. For each candidate parameter: **exec**(command: sqlmap -u "FULL_URL" --level=1 --risk=1 --batch, target: base URL).
4. If confirmed: **report_finding**(detail, severity, target, poc with payload + proof).
5. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Checklist progress: SQLi — [done/not found/N/A]. Parameters: ...").

## OBSERVE

- Response bodies for SQL errors, DB names, version strings.
- sqlmap output for "injectable", "database:", "current database".

## REFLECT

- Was proof captured in poc? If not, do not close the finding; add evidence and re-report or amend.
- Any parameter left untested? Log and continue checklist.

## LOG

- **write_file** after testing: parameters tested, result, checklist progress.
- **report_finding** for every confirmed SQLi before marking phase done.
