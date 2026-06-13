/**
 * Access Control Phase Prompt — injected during access_control checklist section.
 * Covers IDOR, privilege escalation, parameter tampering, logic flaws.
 */

export const ACCESS_CONTROL_PHASE_PROMPT = `## Phase: Access Control & Business Logic

**Load skill:** memory_get(path: "skills/access-control/SKILL.md")

### WHAT YOU MUST TEST
- **IDOR:** Change IDs in URLs/body (user_id, order_id, file_id) — access other users' data?
- **Privilege escalation:** Access admin endpoints as regular user, modify role parameters
- **Parameter tampering:** Change price, quantity, discount, role in requests
- **Logic flaws:** Race conditions, step skipping, negative quantities, price manipulation
- **Rate limiting:** Test for missing rate limits on sensitive endpoints (login, password reset, API)

### REPORT FINDINGS IMMEDIATELY
For EACH confirmed vulnerability: CALL report_finding. Do NOT wait. Do NOT batch. Include POC with actual evidence.

### WHEN DONE
Call **update_pentest_phase** with checklist.access_control=true AND checklist.business_logic=true. Then proceed to "other" section.`;
