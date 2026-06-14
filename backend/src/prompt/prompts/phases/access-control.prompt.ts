export const ACCESS_CONTROL_PHASE_PROMPT = `## Phase: Access Control Attacks

**You MUST attempt to access data you should NOT have access to.**

### ATTACK SEQUENCE:
1. **IDOR — change IDs in URLs:**
   \`\`\`
   curl -s "URL/profile?id=1" 
   curl -s "URL/profile?id=2"  # Try another user's ID
   curl -s "URL/order?id=1"
   curl -s "URL/order?id=2"  # Try another order
   \`\`\`
   **If you can access another user's data → CALL report_finding.**

2. **Privilege escalation:** Access admin-only URLs as a regular user.

3. **Parameter tampering:** Change price, role, permissions in requests.

### REPORT IMMEDIATELY
Every successful IDOR, privilege escalation, or logic bypass → call report_finding.

### AFTER ACCESS CONTROL
Call update_pentest_phase with checklist.access_control=true. Proceed to report phase.`;
