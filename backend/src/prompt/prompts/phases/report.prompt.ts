/**
 * Report Phase Prompt — injected when generating the final report/summary.
 * Covers re-verification, report format, checklist completion check.
 */

export const REPORT_PHASE_PROMPT = `## Phase: Report / Summary

**Re-verify before reporting.** Call **re_verify_findings** (pass conversation_id) to re-check all HIGH/CRITICAL findings. This catches false positives from VerifyAgent. Max 3 attempts per finding; after 3 FAILED → disputed (excluded from report).

### POC requirements (must be in every report_finding)
- **SQLi:** payload used AND proof (DB name from error/sqlmap, or response snippet showing DB data)
- **XSS:** payload AND evidence it executed (e.g. alert(1) triggered, script reflected)
- **Other:** request/command AND response/output snippet that proves the finding

Without proof in poc, the finding is not complete — the user must see the bug is real.

### Checklist completion
Only output a final summary when EVERY section is addressed or marked not applicable:
recon, input_handling, auth_session, access_control, business_logic, other.

If you have NOT completed a section, keep calling tools for the next section — do not summarize early.

### Multi-agent mode
When user asked for multiple agents, do NOT do all work in the main agent. Use sessions_spawn + sessions_send so Gweh, Shadow, Nexus all appear in the UI.

### Dangerous methods, headers, disclosure, CAPTCHA
Load **memory_get(path: "skills/other/SKILL.md")** — check for:
- Dangerous HTTP methods (PUT, DELETE, TRACE)
- Missing security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- Information disclosure (stack traces, version numbers, debug endpoints)
- CAPTCHA bypass techniques`;
