/**
 * Access Control Phase Prompt — injected during access_control checklist section.
 * Covers IDOR, privilege escalation, parameter tampering, logic flaws.
 */

export const ACCESS_CONTROL_PHASE_PROMPT = `## Phase: Access Control & Business Logic

**Load the skill:** memory_get(path: "skills/access-control/SKILL.md")

### What to test
- **IDOR:** Change IDs in URLs/body (user_id, order_id, file_id) — access other users' data?
- **Privilege escalation:** Access admin endpoints as regular user, modify role parameters
- **Parameter tampering:** Change price, quantity, discount, role in requests
- **Logic flaws:** Race conditions, step skipping, negative quantities, price manipulation
- **Rate limiting:** Test for missing rate limits on sensitive endpoints (login, password reset, API)

### Multi-agent coordination
When the user asks for multiple agents (e.g. "work with 3 agents"):
1. Call **agents_list** to see available roles
2. **sessions_spawn** (role: recon) and **sessions_spawn** (role: general) to create sub-agents
3. Delegate tasks via **sessions_send** — always include the actual target URL in messages
4. Use **sessions_history** to read sub-agent findings, then **report_finding** in this session
5. Sub-agents will appear as [Gweh], [Shadow], [Nexus] in the UI

### After access_control + business_logic
Call **update_pentest_phase** with checklist.access_control=true and checklist.business_logic=true. Then proceed to other.`;
