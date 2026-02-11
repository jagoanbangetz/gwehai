---
name: nosql-injection
description: "NoSQL injection testing — when app uses NoSQL (Mongo, etc.). PoC only; report_finding when query logic is bypassed or data disclosed; POC = payload + response snippet."
---

# NoSQL Injection Skill

## Purpose

Identify and verify NoSQL injection when the application uses NoSQL databases (e.g. MongoDB). Use only PoC payloads; no destructive or mass extraction. **report_finding** required when query logic is bypassed or data is disclosed.

## Preconditions

- Target in **SCOPE.md**.
- **memory_search** for target + "NoSQL" or "Mongo" to avoid duplicate testing.
- Confirm or infer NoSQL usage (API params, JSON body with operators like $gt, $where).

## Vulnerability Class

NoSQL injection — user input passed to NoSQL queries without sanitization; operators (e.g. $gt, $ne, $where) can bypass logic or expose data.

## Detection Logic

1. Identify inputs that might be used in NoSQL queries (login, search, filters, API JSON body).
2. Probe with PoC: e.g. `{"$gt": ""}` for login bypass, `' || 1==1` for $where, or similar safe operator injection.
3. Observe response for authentication bypass, extra data, or error revealing query structure.

## Verification Logic

- **exec**(curl with JSON body or param containing operator) or **craft_payload** to send request.
- Confirm when response indicates bypass (e.g. login without valid creds) or discloses data (e.g. list of users).

## Confirmation Criteria

- Query logic bypass (e.g. login with `$gt: ""`) or data disclosure. **report_finding** with **poc** = payload + response snippet.

## Proof Requirements (report_finding)

- **poc** must include: (1) payload used (e.g. password: {"$gt": ""}), (2) response snippet showing bypass or disclosed data. Example: `Payload: password={"$gt":""} | Response: 200 + session cookie` or user list in response.

## Reporting Structure

- **detail**: NoSQL injection, parameter/body, impact (auth bypass / data disclosure), steps to reproduce.
- **severity**: medium / high (context-dependent).
- **target**: URL and parameter or body.
- **poc**: Payload + response snippet (required).

## Memory Logging (write_file)

- Path: **main** or **daily/website/YYYY-MM-DD**.
- Log: inputs tested, result (confirmed / not found / N/A no NoSQL), checklist progress "NoSQL injection: done".

## Safety Rules

- PoC only; no mass extraction, no drop/delete. Only demonstrate bypass or one record disclosure if applicable.
- In-scope only.

## When to Escalate or Pivot

- If app does not use NoSQL: log "NoSQL: N/A" and skip.
- If WAF blocks: try encoding; **memory_get**(path: "skills/waf-bypass/SKILL.md") if needed.

---

## THINK

- Does the app use NoSQL (Mongo, etc.)? Check API docs, error messages, or param names.
- Already tested (memory_search)? Retest only if new inputs or user asked.

## ACT

1. **memory_search**(query: target + "NoSQL" or "Mongo", max_results: 10).
2. For login/search/filter: **exec**(curl with JSON/param payload) or **craft_payload**; capture response.
3. If bypass or disclosure: **report_finding**(detail, severity, target, poc with payload + response).
4. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "NoSQL injection — [done/not found/N/A]. Inputs: ...").

## OBSERVE

- Response for auth success with invalid creds, extra records, or error messages revealing query.

## REFLECT

- Is proof in poc (payload + response)? If not, do not mark done.
- Only PoC used (no destructive ops).

## LOG

- **write_file** after testing: inputs, result, checklist progress.
- **report_finding** for every confirmed NoSQL injection before marking phase done.
