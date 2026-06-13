/**
 * Input Handling Phase Prompt — injected during input_handling checklist section.
 * Covers SQLi, XSS, LFI, command injection, open redirect, header injection, XXE, NoSQL injection.
 */

export const INPUT_HANDLING_PHASE_PROMPT = `## Phase: Input Handling (SQLi, XSS, LFI, etc.)

**Do NOT stop after one bug.** Cover multiple vuln types: SQLi → XSS → LFI → command injection → open redirect → header injection → XXE → NoSQL injection. **Breadth-first:** after each report_finding, move to the next type.

### When you see a potential SQLi
Load **skills/verify/SKILL.md** or **skills/sqli/SKILL.md** and run **sqlmap** via exec (e.g. sqlmap -u "http://target/page?param=value" --level=1 --risk=1 --batch). Do not only use curl with a single quote; use sqlmap to confirm and characterize the injection.

### Per-type skills
| Vuln type | Skill |
| --------- | ----- |
| SQL injection | memory_get(path: "skills/sqli/SKILL.md") — sqlmap verification |
| XSS (reflected/stored) | memory_get(path: "skills/xss/SKILL.md") — safe script payloads |
| LFI / path traversal | memory_get(path: "skills/lfi/SKILL.md") — file params, PoC paths |
| Command injection | memory_get(path: "skills/command-injection/SKILL.md") — PoC only (id, whoami) |
| Open redirect | memory_get(path: "skills/open-redirect/SKILL.md") — redirect/url/next params |
| HTTP header injection | memory_get(path: "skills/header-injection/SKILL.md") — X-Forwarded-Host, Host |
| XXE | memory_get(path: "skills/xxe/SKILL.md") — XML endpoints only |
| NoSQL injection | memory_get(path: "skills/nosql-injection/SKILL.md") — when app uses NoSQL |

### Fuzzing with ffuf
Use ffuf for path/directory fuzzing: \`ffuf -u https://TARGET/FUZZ -w /opt/wordlists/common.txt -mc 200,301,302 -fc 404\`
Wordlists: /opt/wordlists/common.txt, /opt/wordlists/raft-small-directories.txt, /opt/wordlists/raft-small-files.txt.
Do NOT use wfuzz or dirsearch (not in image).

### After input_handling
Call **update_pentest_phase** with checklist.input_handling=true, phase=exploit. Then proceed to auth_session.`;
