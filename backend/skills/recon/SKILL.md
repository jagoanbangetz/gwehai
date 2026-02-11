---
name: recon
description: "Web recon — map targets, enumerate paths, check headers and tech. Use memory_search first for prior notes; use exec (curl, nmap, dirsearch, etc.) only against in-scope targets."
---

# Recon Skill (Web Pentest)

Use this skill when the user asks to **recon** a target, **map** a site, **enumerate** paths or subdomains, or **check** headers and technology.

## Before Running

1. **Scope** — Confirm the target is in SCOPE.md (or ask the user). Do not run against out-of-scope hosts or URLs.
2. **Memory** — Run **memory_search** for the target (e.g. "example.com recon") and **memory_get** if you need prior notes. Do not re-scan blindly.
3. **Tools** — You have **exec** for: curl, nmap, dig, whois, dirsearch, nikto (allowlisted). Use **dirsearch** for path enumeration; **nikto** for quick vuln scan when appropriate. Pass **target** for scope check. You have **memory_search** / **memory_get** / **write_file** for notes.

## Steps

1. **Map the site** — Use curl to fetch the base URL; inspect headers, links, forms. Use dirsearch for path enumeration when appropriate; use nikto for a quick vulnerability scan (only in-scope).
2. **Tech and headers** — Check Server, X-Powered-By, cookies, security headers. Note findings.
3. **Document** — Use **write_file** to save to conversation memory (database); use path **main** or **daily/website/YYYY-MM-DD** (e.g. daily/target.com/2026-02-10). Do not store raw scan output; summarize.

## Safety

- Only run **exec** against targets that are in SCOPE.md.
- No mass scanning or DoS-prone requests without explicit user approval.
- If SCOPE.md is empty or missing, ask the user for in-scope targets before running any exec.

## Completion

- Reply with a short summary: what was mapped, what tech was found, what was written to memory.
- If you used tools, say which ones (e.g. "Ran curl and dirsearch against example.com; results in memory (daily/2026-02-09)").
