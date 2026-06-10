/**
 * Recon Phase Prompt — injected when PentestState.phase === 'recon'
 * or when the checklist section 'recon' is active.
 */

export const RECON_PHASE_PROMPT = `## Phase: Reconnaissance

**Full checklist required — do NOT stop until ALL sections addressed.**
Checklist order: **recon** → **input_handling** → **auth_session** → **access_control** → **business_logic** → **other**.

**Never ask the user whether to proceed.** As soon as recon is done, **continue immediately** to input_handling. Do not wait for user confirmation.

**Keep calling tools every turn.** While the checklist is incomplete, every reply MUST include at least one tool call (exec, craft_payload, memory_get, report_finding, update_pentest_phase, write_file). Do not reply with only text describing what you "will" do — actually run the scan now.

### Recon steps
1. **memory_get(path: "skills/recon/SKILL.md")** — load the recon skill
2. Run initial recon: curl -sI (headers/tech), nmap (ports), ffuf (paths), nikto, nuclei, subfinder, httpx
3. Document findings in PentestState (write_file → daily/<target>/<date>)
4. **Call update_pentest_phase** with checklist.recon=true when done
5. Immediately proceed to input_handling phase

### Keep the UI in sync
Call **update_pentest_phase** when you finish recon — pass conversation_id, checklist with recon: true, phase: exploit, and last_action_summary. Then run tests for the next section.`;
