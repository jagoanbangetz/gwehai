# GwehAI Agent — Feature Summary

GwehAI is a **web application security pentesting assistant**. It uses skills, tools, and conversation memory to run recon, verify vulnerabilities, and report findings — all within scope and safety rules.

---

## Core Role

- **Focus:** Web app security only (recon, vulnerability testing, documentation).
- **Behavior:** Methodical, documentation-first. Uses tools for every pentest/scan/recon request; does not answer from knowledge alone when you ask to test a URL or site.
- **Output:** Thinking (reasoning) plus a final reply; findings are saved to the database with proof (POC).

---

## Skills (What the Agent Can Do)

| Skill | When Used | What It Does |
|-------|-----------|--------------|
| **Recon** | Map site, enumerate paths/subdomains, check headers/tech | Loads `skills/recon/SKILL.md`, runs memory_search → exec (curl, nmap, dirsearch, nikto) → write_file |
| **Verify** | Confirm a vulnerability (e.g. potential SQLi/XSS) | Loads `skills/verify/SKILL.md`, runs exec (e.g. sqlmap for SQLi, curl for XSS) → report_finding |
| **WEB_CHECKLIST** | Full pentest or “test this URL” | Loads `skills/WEB_CHECKLIST.md`, follows checklist: recon → input handling (SQLi, XSS, etc.) → auth → access control → other. Does not stop after one finding. |
| **DNS Intel** | DNS/domain info, whois, reverse whois | Loads `skills/dns-intel/SKILL.md`, runs whois/dig/curl and reverse-whois lookups |
| **Check-Host** | Ping/HTTP/TCP/DNS from multiple global nodes | Loads `skills/check-host/SKILL.md`, uses check-host.net API via exec |
| **Subdomain Finder** | Find/review subdomains (C99-style) | Loads `skills/subdomain-finder/SKILL.md`, fetches/parses C99 subdomain scan pages |
| **WAF Bypass** | User asks about WAF bypass or WAF blocking payloads | Loads `skills/waf-bypass/SKILL.md`, explains and (if in scope) runs minimal PoC requests |
| **Burp-Style Agent** | User wants proxy/repeater/intruder-style testing | Loads `skills/burp-style-agent/SKILL.md`, maps to proxy-style review, repeater replay, or intruder-style fuzzing |
| **Image-to-Text** | Extract text from image/screenshot (OCR) | Loads `skills/image-to-text/SKILL.md`, runs allowlisted OCR (e.g. tesseract) |

---

## Tools (How the Agent Does It)

### Memory & Files

| Tool | Purpose |
|------|---------|
| **memory_search** | Search conversation memory (DB). First step for pentest/recon. |
| **memory_get** | Read from memory (main, daily/website/YYYY-MM-DD), SCOPE.md, or skills (e.g. skills/recon/SKILL.md). |
| **write_file** | Write/append to conversation memory (DB). Document targets, findings, checklist progress. |

### Recon & Testing

| Tool | Purpose |
|------|---------|
| **exec** | Run allowlisted commands. Recon: curl, nmap, dirsearch, nikto. Testing: sqlmap (SQLi), wfuzz (fuzzing). Requires **command** and **target**. |
| **craft_payload** | Run a small script in a sandbox (e.g. encode/decode, small HTTP request). 30s timeout. |

### Reporting

| Tool | Purpose |
|------|---------|
| **report_finding** | **Required** when a vulnerability is confirmed. Saves to DB: detail, severity, target, **poc** (must include concrete proof: payload + response/evidence). Must be called for each finding before the final summary. |

### Multi-Agent (Sessions)

| Tool | Purpose |
|------|---------|
| **agents_list** | List allowed agent roles (recon, exploit, general). |
| **sessions_spawn** | Create a new sub-agent (optional role/title). Returns session_id. |
| **sessions_send** | Send a message to a sub-agent (e.g. “run nmap on target”). wait_for_reply: true = get reply; false = run in background. |
| **sessions_history** | Read message history of another session (sub-agent). |
| **sessions_list** | List sessions (e.g. sub-agents of current conversation). |
| **session_status** | Show status of a session (id, model, message count, last activity). |

When the user asks for “multiple agents” or “work with 3 agents”, the main agent spawns sub-agents (e.g. Gweh, Shadow, Nexus), delegates tasks (recon, nikto, headers), and combines findings via sessions_history and report_finding.

---

## Workflow (Typical Pentest)

1. **Scope & memory** — Respect SCOPE.md; memory_search for prior notes on the target.
2. **Checklist** — For full pentest: memory_get(WEB_CHECKLIST.md), then follow in order.
3. **Recon** — memory_get(recon/SKILL.md), then exec (curl, nmap, dirsearch, nikto), write_file progress.
4. **Find & verify** — From responses, identify possible issues; for each, load verify/SKILL.md, run exec (e.g. sqlmap for SQLi), then **report_finding** with POC.
5. **Document** — write_file to main or daily/website/YYYY-MM-DD; report_finding for every confirmed vuln.
6. **Do not stop after one bug** — Continue through the checklist (recon → input handling → auth → access control → other) until done or scope exhausted.

---

## Safety & Rules

- **In-scope only** — Exec runs only against targets in SCOPE (or user-confirmed). No arbitrary exploit code; only allowlisted tools and payloads.
- **Proof required** — Every report_finding must include a **poc** with real evidence (e.g. SQLi: payload + DB/response snippet; XSS: payload + proof script ran).
- **No destructive actions** — No DROP TABLE, no wiping data, no DoS; verification is proof-of-concept only.
- **Checklist-driven** — For “pentest this URL”, the agent loads WEB_CHECKLIST.md and works through it; it does not summarize after a single finding.

---

## Summary Table

| Question | Answer |
|----------|--------|
| What is GwehAI? | Web application security pentesting assistant (recon, verify, report). |
| How does it pentest? | Uses skills (recon, verify, WEB_CHECKLIST, etc.) and tools (memory_*, exec, craft_payload, report_finding). |
| Can it run multiple agents? | Yes. sessions_spawn + sessions_send + sessions_history for parallel recon/verification. |
| Where are findings stored? | Database via report_finding; conversation memory via write_file. |
| Is it safe? | Only if scope (SCOPE.md) and allowlisted tools are enforced; every finding requires POC. |
