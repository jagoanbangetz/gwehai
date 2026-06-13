/**
 * Input Handling Phase Prompt — injected during input_handling checklist section.
 * Covers SQLi, XSS, LFI, command injection, open redirect, header injection, XXE, NoSQL injection.
 */

export const INPUT_HANDLING_PHASE_PROMPT = `## Phase: Input Handling (SQLi, XSS, LFI, etc.)

**🚨 You MUST find AND report bugs. Do NOT move on without calling report_finding.**

### TEST ORDER (breadth-first — do NOT stop after one bug):
**SQLi → XSS → LFI → Command Injection → Open Redirect → Header Injection → XXE → NoSQL**

After EACH confirmed vulnerability: CALL report_finding FIRST, THEN move to the next type.

### SQL INJECTION TESTING (DO THIS FIRST)

When you see a parameter in a URL (e.g. ?id=, ?page=, ?item=), you MUST test it:
1. Load skill: memory_get(path: "skills/sqli/SKILL.md")
2. Run sqlmap: \`sqlmap -u "URL?param=value" --level=1 --risk=1 --batch\`
3. If sqlmap confirms injection → CALL report_finding with POC (sqlmap output + DB name)
4. Then move to XSS testing

### XSS TESTING
1. Load skill: memory_get(path: "skills/xss/SKILL.md")
2. Test every form input and URL parameter with XSS payloads via curl
3. If script/event handler reflected → CALL report_finding with payload + proof
4. Then move to LFI

### REMAINING TYPES (LFI, CMDi, Redirect, Header, XXE, NoSQL)
Load the matching skill for each type (skills/lfi/SKILL.md, etc.). Test, report_finding per confirmed vuln, then move to next.

### FUZZING
Use ffuf for path brute: \`ffuf -u https://TARGET/FUZZ -w /opt/wordlists/common.txt -mc 200,301,302 -fc 404\`
Wordlists: /opt/wordlists/common.txt

### WHEN DONE
Call update_pentest_phase with checklist.input_handling=true. Then proceed to auth_session.`;
