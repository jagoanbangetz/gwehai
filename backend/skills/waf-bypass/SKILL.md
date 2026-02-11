---
name: waf-bypass
description: "Study and safely test WAF behavior and bypass techniques against in-scope targets only."
---

# WAF Bypass Skill (Defensive)

Use this skill when the user asks how to **understand, test, or harden** a Web Application Firewall (WAF), or when payloads are being blocked and you need to:

- identify which rules/filters are being triggered
- design safer test payloads
- help the user improve their WAF configuration

Important: Only use this skill against **in-scope systems** you have explicit permission to test.

## References (for learning and reasoning)

These public resources describe common WAF bypass techniques and defenses:

- Medium (WAF bypass techniques 2025): https://medium.com/infosecmatrix/web-application-firewall-waf-bypass-techniques-that-work-in-2025-b11861b2767b
- OWASP SQLi WAF bypass: https://owasp.org/www-community/attacks/SQL_Injection_Bypassing_WAF
- PortSwigger phantom version cookie: https://portswigger.net/research/bypassing-wafs-with-the-phantom-version-cookie
- BugBase top 10 WAF bypass: https://bugbase.ai/blog/top-10-ways-to-bypass-waf
- Indusface WAF bypass risks and prevention: https://www.indusface.com/blog/waf-bypass-risks-prevention/
- Vaadata SQLi with WAF bypass: https://www.vaadata.com/blog/exploiting-an-sql-injection-with-waf-bypass/
- Claroty Team82 JSON-based SQL/WAF bypass: https://claroty.com/team82/research/js-on-security-off-abusing-json-based-sql-to-bypass-waf
- Cobalt WAF bypass guidance: https://www.cobalt.io/vulnerability-wiki/v5-validation-sanitization/waf-bypass
- Research context: https://arxiv.org/html/2503.10846v1

Use them to **inform your reasoning and explanations**, not to blindly copy payloads.

## Before Running

1. Confirm scope and authorization.
2. Identify the WAF/provider if possible (headers, error pages, responses).
3. Use `memory_search` for prior notes on this target and WAF behavior.
4. Clarify the user’s goal:
   - improve WAF rules or tuning
   - understand why something is blocked
   - safely validate that a fix works

## Steps (high level)

1. Baseline behavior
   - Send benign requests to confirm that the endpoint works when no suspicious input is present.
2. Characterize blocking
   - Carefully test minimal payload variations (for example, single quotes, basic SQL keywords) while monitoring which responses trigger the WAF.
   - Use techniques from the references to understand encoding or obfuscation patterns (JSON-based SQL, alternate keywords, comment styles), but keep tests minimal and targeted.
3. Log and compare
   - Note which payloads are blocked versus allowed.
   - Look for patterns that indicate specific rule sets (for example, strict SQL keyword filters, JSON-only parsers, cookie-based checks).
4. Advise hardening
   - Provide recommendations to **improve** WAF rules (tighter allowlists, better normalization, enabling advanced rulesets) and application-side fixes (parameterized queries, encoding).
5. Document
   - Use `write_file` to record tests, responses, and suggested rule changes in conversation memory.

## Safety

- Only test against in-scope systems with explicit permission.
- Keep payloads as minimal as possible to demonstrate behavior (proof-of-concept), not to cause damage.
- Do not share or encourage exploit chains that go beyond agreed testing scope.
- Focus your final answer on **defensive guidance** and how to strengthen WAF and application security.

## Completion

- Summarize:
  - which types of payloads the WAF blocked or allowed
  - what this indicates about the WAF rules
  - concrete recommendations to improve rules and underlying application defenses.
- If appropriate, reference the articles above so the user can read further.

