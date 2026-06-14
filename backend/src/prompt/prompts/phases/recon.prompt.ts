/**
 * Recon Phase Prompt — injected when PentestState.phase === 'recon'
 * V2: Recon is JUST the starting point. Move to attack FAST.
 */

export const RECON_PHASE_PROMPT = `## Phase: Reconnaissance (5 MINUTES MAX)

**Recon is NOT the goal. It's just preparation for ATTACK. Move FAST.**

### RECON ACTIONS (do all of these, then MOVE ON):
1. **curl -sI TARGET** — get headers, server, tech stack. Do NOT report these.
2. **ffuf -u TARGET/FUZZ -w /opt/wordlists/common.txt -mc 200,301,302** — find paths
3. **nuclei -t /opt/nuclei-templates -u TARGET** — quick vuln scan
4. Document ALL discovered URLs with parameters in a list. You WILL attack them next.

### 🚨 CRITICAL: After recon, DO NOT stop. DO NOT summarize. Go STRAIGHT to ATTACK.

Save discovered URLs+parameters. Call update_pentest_phase with checklist.recon=true. Then IMMEDIATELY start input_handling — attack every parameter with sqlmap.

**Text-only replies are FORBIDDEN. Every reply must have exec/craft_payload tool calls.**`;
