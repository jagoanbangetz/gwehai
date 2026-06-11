/**
 * Report Finding Tool Prompt — injected when report_finding is called.
 * Reinforces the finding workflow and reminds to continue scanning.
 */

export const REPORT_FINDING_TOOL_PROMPT = `### After report_finding
You just saved a finding. Now:
1. **Continue scanning** — move to the next checklist area (e.g. SQLi → XSS → LFI → auth → access control).
2. **Call update_pentest_phase** if you finished a checklist section.
3. **Do NOT summarize yet** — keep testing until the full checklist is covered.
4. **Every confirmed vuln needs its own report_finding call** — do not batch multiple findings into one summary.`;
