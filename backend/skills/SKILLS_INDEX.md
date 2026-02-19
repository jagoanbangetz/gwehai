# GwehAI Skills Index

Load skills via **memory_get(path: "skills/<path>")**.  
All skills follow THINK → ACT → OBSERVE → REFLECT → LOG; require **report_finding** for confirmed vulns; use **write_file** for checklist progress.  
Respect the explicit scope agreed with the user and recorded in the Pentest State; PoC only; no destructive payloads.

---

## 0. Orchestration & Workflow (entrypoints)

Always start from these when running a full pentest.

| Path | Purpose |
|------|---------|
| **skills/CORE_ORCHESTRATOR.md** | Core Orchestrator — one conversation = one PentestContext; PentestState schema; phase gates (recon → exploit → report); checklist order; state IO; reset policy; no duplicate phases. |
| **skills/WEB_CHECKLIST.md** | Web pentest orchestrator + checklist (Scope → Recon → Enumeration → Verify → Report; recon → input handling → auth → access control → other). |
| **skills/PENTEST_WORKFLOW.md** | Pentest Workflow & State Machine — stages, locks, Pentest State + Work Registry schema under `daily/<target>/<YYYY-MM-DD>`. |
| **skills/MULTI_AGENT_COORDINATION.md** | Multi-agent coordination — roles (B–H: Recon, Enum, Verify-ACL/Injection/RequestConfig/BusinessLogic, Report), Work Registry, claim/lock, HELP_REQUEST, FINDING_KEY. |
| **skills/SOUL.md** | Agent persona (who you are, boundaries, behavior). |

---

## 1. Recon & Intelligence

Use during **Recon** / early mapping phases.

| Path | Purpose |
|------|---------|
| **skills/recon/SKILL.md** | Core recon — map targets, enumerate paths, check headers/tech, WAF hints (curl, nmap, dirsearch, wfuzz). |
| **skills/api-docs/SKILL.md** | API docs — for API targets: fetch /docs/, /swagger.json, /openapi.json and parse endpoints/params; do not skip reading API docs (e.g. rest.vulnweb.com, user says "this is API"). |
| **skills/enumeration/SKILL.md** | Enumeration slice — parameter discovery (query/body), auth surface mapping, light hidden-param fuzzing; outputs to Parameters.discovered. |
| **skills/dns-intel/SKILL.md** | DNS intel — records, whois, reverse whois/domain relationships. |
| **skills/check-host/SKILL.md** | Check-host — distributed ping/http/tcp/dns checks from multiple global nodes. |
| **skills/subdomain-finder/SKILL.md** | Subdomain finder — parse C99 scan pages and summarize subdomains/IPs. |
| **skills/waf-bypass/SKILL.md** | WAF bypass — explanation and minimal PoC when WAF blocks traffic. |
| **skills/git-search/SKILL.md** | Git search — find wordlists, payloads, tools, and examples on GitHub via **git_search** (e.g. "wordlist ffuf", "sqli payloads"). |

---

## 2. Input Handling & Injection

Use during **Enumeration** and **Verify** for parameterized endpoints.

| Path | Purpose |
|------|---------|
| **skills/sqli/SKILL.md** | SQL injection — fuzz parameters, verify with sqlmap; POC = payload + proof (DB name or response snippet). |
| **skills/nosql-injection/SKILL.md** | NoSQL injection — for NoSQL-backed apps; report when logic bypass or data disclosure confirmed. |
| **skills/xss/SKILL.md** | Reflected & stored XSS — safe script payloads; POC shows execution evidence. |
| **skills/xss-advanced/SKILL.md** | Advanced XSS — DOM-based, attribute/SVG/context, mutation; safe PoC only. |
| **skills/lfi/SKILL.md** | LFI / path traversal — file parameters with PoC paths (e.g. `../../../etc/passwd`). |
| **skills/command-injection/SKILL.md** | Command injection — inputs passed to shell; PoC only (id, whoami). |
| **skills/open-redirect/SKILL.md** | Open redirect — test redirect/url/next params with PoC URL. |
| **skills/header-injection/SKILL.md** | HTTP header injection — Host / X-Forwarded-Host, cache poisoning, header reflection. |
| **skills/xxe/SKILL.md** | XXE — XML endpoints only; entity expansion / file read PoC. |

---

## 3. Authentication, Session & Access Control

Use after auth surfaces are discovered (login/register/reset, post-login areas).

| Path | Purpose |
|------|---------|
| **skills/auth-journey/SKILL.md** | Full auth journey — registration, login, session, reset; safe PoCs, evidence per issue. |
| **skills/auth/SKILL.md** | Generic auth & session — registration/login, CSRF, reset. |
| **skills/post-login-acl/SKILL.md** | Post-login access control — ACL/IDOR with authenticated cookies/HAR; escalation checks. |
| **skills/access-control/SKILL.md** | Generic access control & logic — IDOR, privilege escalation, parameter tampering, multi-step logic flaws. |
| **skills/rate-limit/SKILL.md** | Rate limiting & anti-automation — small-burst checks on login/reset/OTP/auth APIs; IP vs account limits. |
| **skills/logic-flaw/SKILL.md** | Business logic — workflow bypass, price/discount tampering, replay, state machine, micro race tests. |

---

## 4. Other Web Surfaces

Use when specific features/technologies are present.

| Path | Purpose |
|------|---------|
| **skills/file-upload/SKILL.md** | File upload — type bypass, path traversal, XSS via uploads. |
| **skills/jwt-session/SKILL.md** | JWT / session tokens — alg none, weak secrets, tokens in URL. |
| **skills/cors/SKILL.md** | CORS — origin reflection, credentialed requests, misconfigurations. |
| **skills/ssrf/SKILL.md** | SSRF — webhook/callback/fetch-URL style endpoints. |
| **skills/other/SKILL.md** | Misc — dangerous methods, security headers, info disclosure, CAPTCHA bypass. |

---

## 5. Verification, Burp-style & Utilities

Use for confirming findings, burp-style workflows, and utilities.

| Path | Purpose |
|------|---------|
| **skills/verify/SKILL.md** | Generic verification — safe PoC for suspected findings (SQLi/XSS/etc.) using appropriate tools. |
| **skills/burp-style-agent/SKILL.md** | Burp-style agent — proxy/repeater/intruder-style testing; ties together tools, WEB_CHECKLIST, and verify. |
| **skills/image-to-text/SKILL.md** | Image-to-text (OCR) — extract text from screenshots/images when requested. |

---

## 6. Install & Extend

Use when tools are missing or you need a reusable procedure not in the built-in skills.

| Path | Purpose |
|------|---------|
| **skills/install-tools/SKILL.md** | Install missing tools — use **exec** with apt-get, pip, pip3, npm when a required tool is not available in the environment. |
| **skills/add-skill/SKILL.md** | Add a new skill — use **add_skill** to create skills/custom/&lt;name&gt;/SKILL.md so you can load it later with memory_get. |

---

## How to load

- **Full pentest flow:** `memory_get(path: "skills/WEB_CHECKLIST.md")` to start the orchestrator, then let it load skills per stage/phase.
- **Single skill:** `memory_get(path: "skills/<name>/SKILL.md")` when you need a focused checklist (e.g. `skills/sqli/SKILL.md`).
- **Custom skill (you added):** `memory_get(path: "skills/custom/<name>/SKILL.md")` after **add_skill** (e.g. `skills/custom/graphql-checks/SKILL.md`).
- **Index (this file):** `memory_get(path: "skills/SKILLS_INDEX.md")` to see available skills and categories.

---

## Rules (all skills)

- **report_finding** is required for every confirmed vulnerability before marking that phase done.
- **write_file** to `main` or `daily/website/YYYY-MM-DD` to log checklist progress and avoid duplicate testing.
- Respect the scope explicitly provided by the user and recorded in the Pentest State; only test in-scope targets.
- PoC only; no destructive payloads.
- Check **memory_search** before testing to avoid re-testing the same area.
