---
name: other
description: "Other checks — dangerous HTTP methods, security headers, information disclosure, CAPTCHA bypass. PoC only; report_finding when misconfiguration or disclosure confirmed; POC = request/response snippet."
---

# Other (Misc) Skill

## Purpose

Cover remaining checklist items: dangerous HTTP methods (OPTIONS, PUT, DELETE), missing or weak security headers (CSP, X-Frame-Options, HSTS), information disclosure (stack traces, verbose errors), CAPTCHA bypass (replay, remove param). **report_finding** when misconfiguration or disclosure is confirmed.

## Preconditions

- Target in **SCOPE.md**.
- **memory_search** for target + "security headers" or "methods" or "disclosure" to avoid duplicate testing.
- Have baseline of normal responses for comparison.

## Vulnerability Classes

- **Dangerous HTTP methods**: OPTIONS, PUT, DELETE enabled and actionable (e.g. PUT overwrites resource).
- **Security headers**: Missing or weak CSP, X-Frame-Options, HSTS, etc.
- **Information disclosure**: Stack traces, verbose errors, version strings in response.
- **CAPTCHA bypass**: Replay old value, remove parameter, or other PoC bypass.

## Detection Logic

1. **Methods**: **exec**(curl -X OPTIONS, -X PUT, -X DELETE) to target; observe Allow header and behavior (e.g. PUT creates/overwrites).
2. **Headers**: **exec**(curl -I); check for X-Frame-Options, Content-Security-Policy, Strict-Transport-Security; note missing or weak values.
3. **Disclosure**: Trigger error (invalid input, bad path); observe response for stack trace, DB version, path disclosure.
4. **CAPTCHA**: If CAPTCHA present, try replaying same token or omitting param; observe if request succeeds.

## Verification Logic

- **exec**(curl) for methods and headers; **exec** or **craft_payload** to trigger error or CAPTCHA flow.
- Confirm when: dangerous method is allowed and has effect; critical header missing or weak; sensitive data in error response; CAPTCHA bypassed.

## Confirmation Criteria

- Evidence of misconfiguration or disclosure. **report_finding** with **poc** = request/response snippet (e.g. Allow: PUT, DELETE; or missing X-Frame-Options; or stack trace in body).

## Proof Requirements (report_finding)

- **poc** must include: (1) what was tested, (2) response snippet (header or body). Example: `Request: OPTIONS / | Response: Allow: GET, POST, PUT, DELETE` or `Response: 500 with stack trace showing path /var/app/...`.

## Reporting Structure

- **detail**: Dangerous methods / missing headers / information disclosure / CAPTCHA bypass, location, impact.
- **severity**: low / medium (typically).
- **target**: URL or endpoint.
- **poc**: Request/response snippet (required).

## Memory Logging (write_file)

- Path: **main** or **daily/website/YYYY-MM-DD**.
- Log: areas tested (methods, headers, disclosure, CAPTCHA), result per area (confirmed / not found), checklist progress "Other: done".

## Safety Rules

- No destructive use of PUT/DELETE (e.g. do not overwrite real resource; use test path if possible). PoC only for CAPTCHA (one replay or param omit).
- In-scope only.

## When to Escalate or Pivot

- If PUT/DELETE allowed: report and recommend disabling or restricting; do not perform destructive action.
- If CAPTCHA not present: log "CAPTCHA: N/A" and skip.

---

## THINK

- Which endpoints to test for methods? Which pages for headers? How to trigger errors safely?
- Already tested (memory_search)? Retest only if new endpoints or user asked.

## ACT

1. **memory_search**(query: target + "security headers" or "methods" or "disclosure", max_results: 10).
2. **exec**(curl -X OPTIONS URL); **exec**(curl -X PUT URL -d "test") on test path if possible; **exec**(curl -X DELETE test URL); **report_finding** if dangerous method has effect.
3. **exec**(curl -I URL); compare to best practice (X-Frame-Options, CSP, HSTS); **report_finding** if critical header missing or weak.
4. Trigger error (e.g. invalid param); capture response; **report_finding** if stack trace or sensitive path/version disclosed.
5. If CAPTCHA: try replay/omit param; **report_finding** if bypassed.
6. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Other — Methods: []; Headers: []; Disclosure: []; CAPTCHA: []. Checklist progress: Other done.").

## OBSERVE

- Allow header, effect of PUT/DELETE, presence and value of security headers, error body content.

## REFLECT

- Is proof in poc for each finding? If not, do not mark that item done.
- All "other" areas covered? Log and conclude checklist.

## LOG

- **write_file** after testing: areas, result per area, checklist progress.
- **report_finding** for every confirmed misconfiguration or disclosure before marking phase done.
