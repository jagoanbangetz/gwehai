/**
 * Recon Phase Prompt — injected when PentestState.phase === 'recon'
 * or when the checklist section 'recon' is active.
 */

export const RECON_PHASE_PROMPT = `## Phase: Reconnaissance

**🚨 Full checklist required — do NOT stop until ALL sections are done.**
Checklist order: **recon** → **input_handling** → **auth_session** → **access_control** → **business_logic** → **other**.

**RULES FOR THIS PHASE:**
1. Load recon skill: memory_get(path: "skills/recon/SKILL.md")
2. Run tools NOW: curl -sI (headers), nmap (ports), ffuf (paths), nikto, nuclei
3. Document findings: write_file → daily/<target>/<date>
4. **If ANY tool output triggers a vulnerability pattern (SQL error, XSS, etc.) → CALL report_finding IMMEDIATELY. Do NOT wait.**
5. When recon done: call update_pentest_phase with checklist.recon=true
6. **IMMEDIATELY proceed to input_handling — do NOT ask "would you like to proceed?"**

**REMEMBER: Every reply MUST include at least one tool call. Text-only replies are FORBIDDEN during pentest.**`;
