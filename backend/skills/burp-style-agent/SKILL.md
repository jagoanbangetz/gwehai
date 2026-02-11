---
name: burp-style-agent
description: "Burp Suite-style web testing workflow using exec, memory, and reporting tools."
---

# Burp Suite-style Web Testing Agent

Use this skill when the user asks you to behave like a **Burp Suite-style web testing assistant**: inspecting requests and responses, replaying and modifying requests, and performing targeted fuzzing and active checks in a controlled way.

This skill does **not** give you an interactive proxy UI, but it maps Burp concepts onto your tools:

- "Proxy" and "Logger" → reading and explaining HTTP requests/responses.
- "Repeater" → replaying and modifying individual HTTP requests.
- "Intruder" → parameterized fuzzing of specific fields with wordlists or patterns.
- "Scanner-style" checks → using allowlisted tools (curl, wfuzz, sqlmap, etc.) guided by WEB_CHECKLIST and verify skills.

## Before Running

1. Confirm scope and authorization (see SCOPE.md and conversation context).
2. Ask the user what mode they want, for example:
   - "act like Repeater and help me tweak this one request"
   - "act like Intruder and fuzz this parameter safely"
   - "review these logs like Burp Proxy and tell me what looks risky"
3. Use `memory_search` for prior notes on this target (URLs, parameters, auth state, previous findings).
4. If the user wants a broader pentest, load `skills/WEB_CHECKLIST.md` and keep this skill in mind as the interaction pattern.

## Concepts and Mapping

### Proxy-style review

- Review raw HTTP requests and responses (user-provided or from exec output).
- Highlight:
  - interesting headers (auth, cookies, cache, CSP, CORS)
  - insecure patterns (missing security headers, sensitive info in URL, weak cookies)
  - potential injection points (query params, JSON bodies, headers that reflect).

### Repeater-style replay

- For a single request the user cares about:
  - Reconstruct it using `exec` (for example, curl with method, headers, body).
  - Make **small, deliberate modifications** (parameters, headers, body fields) at the user’s request.
  - Compare status codes, response sizes, and key body snippets to explain effects.

### Intruder-style fuzzing (safe)

- When the user wants to fuzz a specific parameter:
  - Confirm fuzzing is allowed in scope (rate limits, production vs staging).
  - Prefer focused lists or patterns, not huge wordlists.
  - Use `exec` with wfuzz or curl loops (via craft_payload) in a **rate-limited, low-risk** way.
  - Look for outliers (status codes, response length, error messages) and then switch back to verify and WEB_CHECKLIST skills for deeper analysis.

## Steps (high level)

1. Clarify mode (proxy, repeater, intruder-style, or mixed) and goal.
2. If needed, normalize the user’s request into a clear HTTP representation:
   - method, URL, headers, body, auth details (or placeholders).
3. For **proxy-style**:
   - Walk through the request and response, annotate risks and notable fields.
4. For **repeater-style**:
   - Use `exec` with curl to send the baseline request.
   - Apply one change at a time; observe and explain differences.
5. For **intruder-style (fuzzing)**:
   - Choose a single parameter or insertion point.
   - Design a small, controlled set of payloads (for example, basic injection probes, edge-case values).
   - Run them using wfuzz or scripted curl via `exec` or `craft_payload`.
   - Identify interesting responses and then switch to verify/reporting flows as needed.
6. Throughout, update conversation memory via `write_file` with:
   - tested URLs and parameters
   - any anomalies or potential findings
   - next steps.

## Safety

- Respect SCOPE.md and any rate limit/impact guidance.
- Keep fuzzing **narrow and low-rate**; avoid massive scans or denial-of-service patterns.
- Do not attempt credential guessing or brute forcing unless explicitly in scope.
- When you see evidence of a real vulnerability, switch to `skills/verify/SKILL.md` and use `report_finding` with strong proof-of-concept details.

## Completion

- Clearly state which Burp-style mode(s) you used (proxy/repeater/intruder-style).
- Summarize:
  - key requests tested and what changed
  - any anomalies or suspected issues
  - confirmed findings that were reported via `report_finding`
  - suggested next steps (further checks, WAF tuning, code fixes).

