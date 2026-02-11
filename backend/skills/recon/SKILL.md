---
name: recon
description: "Web recon — map targets, extract URLs/forms, enumerate paths, check headers and tech. Use memory_search first for prior notes; use exec (curl, nmap, dirsearch, etc.) only against in-scope targets."
---

# Recon Skill (Web Pentest)

Use this skill when the user asks to **recon** a target, **map** a site, **enumerate** paths or subdomains, or **check** headers and technology.

This skill now also focuses on **extracting URLs and HTML forms** to seed:

- `Endpoints.discovered` (URLs/paths)
- `Parameters.discovered` (form/query parameter names)
in the Pentest State at `daily/<target>/<YYYY-MM-DD>`.

## Before Running

1. **Scope** — Confirm the target is explicitly in-scope per user instructions and Pentest State (`daily/<target>/<YYYY-MM-DD>`). Do not run against out-of-scope hosts or URLs.
2. **Memory** — Run **memory_search** for the target (e.g. "example.com recon") and **memory_get** if you need prior notes. Do not re-scan blindly.
3. **Tools** — You have **exec** for: curl, nmap, dig, whois, dirsearch, wfuzz (allowlisted). Use **dirsearch** for path enumeration. Pass **target** for scope check. You have **memory_search** / **memory_get** / **write_file** for notes and Pentest State updates.

## Steps

### 1. Map the site & extract URLs/forms

1. Use **exec** with curl to fetch the base URL (follow redirects safely):
   - Example: `curl -sL -D - "https://target.com"`.
2. Capture:
   - The response body (HTML) for link/form extraction.
   - Response headers for tech/WAF hints (see section below).
3. Run a small **craft_payload** helper (e.g. Python) to:
   - Parse `<a href="...">` and `<link href="...">` to collect URLs.
   - Parse `<form>` tags:
     - `action`, `method`, and `<input name="...">` / `<textarea name="...">` / `<select name="...">`.
   - Normalize URLs:
     - Resolve relative paths against the base URL.
     - Lowercase host; keep scheme and path as-is.
   - Output a concise list such as:
     - `URL: https://target.com/path | source=link`
     - `FORM: https://target.com/login | method=POST | params=[username,password]`
4. Append a summary of discovered URLs/forms to:
   - `Endpoints.discovered` (URLs/paths).
   - `Parameters.discovered` (parameter names) where applicable.
   via **write_file** to `daily/<target>/<YYYY-MM-DD>` (Pentest State), using a structured but human-readable format.

You do **not** need to store full HTML; just store the normalized URLs and form metadata.

### 2. Path enumeration (dirs/files)

1. Use **exec** with **dirsearch** (or a curl/wfuzz fallback) against the base URL:
   - Keep wordlists and concurrency modest to avoid stress.
2. Record:
   - Interesting directories (`/admin`, `/login`, `/dashboard`, `/api/`, etc.).
   - Likely backup/config files (`.bak`, `.old`, `.zip`, `.tar`, `.env`, `config.php`, etc.).
3. Update:
   - `Endpoints.discovered` with any new directories/files.
   - `# Tested vectors` and `# Checklist progress` (via the Main Agent/orchestrator) to reflect that dir/path enumeration has been done.

### 3. Tech, headers, and obvious misconfigurations

1. Use **exec** with curl for headers:
   - Example: `curl -sI "https://target.com"`.
2. Note:
   - Server type, X-Powered-By, framework/CMS hints.
   - Security headers (CSP, X-Frame-Options, X-Content-Type-Options, HSTS, etc.).
   - WAF-related headers or patterns if any.
3. For **HTML responses**, quickly scan for:
   - Debug banners or non-production warnings (e.g. "debug=true", "development mode").
   - Visible stack traces or error pages from frameworks.
4. For **linked JavaScript files** (collected in Step 1):
   - Optionally fetch a small subset with **exec**(curl) and look for:
     - Hard-coded API base URLs (e.g. `https://api.target.com/...`).
     - Obvious secrets or tokens (API keys, access tokens) — **do not exfiltrate more than needed to prove the issue**.
     - Feature flags that indicate non-production or debug modes.
   - Treat these as **misconfiguration/information disclosure** candidates to be verified later via the appropriate skill (e.g. `other`, `ssrf`, `access-control`).
5. Store a summarized header/tech/misconfig profile via **write_file** (e.g. into `daily/<target>/<YYYY-MM-DD>` under `Artifacts.recon` and `# Checklist progress`), without dumping full JS/HTML content.

### 4. Document

- Use **write_file** to save recon notes to conversation memory (database); use:
  - `main` or
  - `daily/<target>/<YYYY-MM-DD>` (e.g. `daily/target.com/2026-02-10`).
- Do not store raw scan output; summarize:
  - Key URLs, forms, parameters.
  - Tech stack and headers.
  - Paths and interesting files.

## Safety

- Only run **exec** against targets that are explicitly in-scope per user instructions and Pentest State.
- No mass scanning or DoS-prone requests without explicit user approval.
- If scope is unclear, ask the user for in-scope targets before running any exec.

## Completion

- Reply with a short summary: what was mapped, what tech was found, what was written to memory.
- If you used tools, say which ones (e.g. "Ran curl and dirsearch against example.com; results in memory (daily/2026-02-09)").
