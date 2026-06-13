---
summary: "Tools the pentest agent can use — memory, files, browser, exec"
read_when:
  - Implementing or exposing tools for your pentest AI agent
---

# Tools for the Pentest Agent

This doc lists the tools your agent can use with the memory and prompt setup. **Required** = needed for memory recall and writing. **Optional** = useful for web pentest (recon, scans, notes).

---

## Required (memory)

### 1. `memory_search(query, max_results?, min_score?)`

- **Purpose:** Search conversation memory in the database so the agent can recall prior targets, findings, and preferences without loading all memory into the API.
- **Input:** `query` (string). Optional: `max_results` (e.g. 5–10), `min_score` (if you use scores).
- **Output:** List of snippets, e.g. `{ results: [{ path, snippet, fromLine?, toLine?, score? }] }`. Paths are DB keys: main, daily/YYYY-MM-DD.
- **Implementation:** Memory is stored in the database (one row per conversation, JSON column). Search over values; return path (key) + snippet.

### 2. `memory_get(path, from?, lines?)`

- **Purpose:** Read memory by path after memory_search (so the agent pulls only what it needs).
- **Input:** `path` = **main** or **daily/YYYY-MM-DD** (stored in DB; no .md files). Optional: `from` (line number), `lines` (count).
- **Output:** Plain text or `{ path, text }`. Reject paths outside allowed keys (main, daily/YYYY-MM-DD).
- **Implementation:** Read from conversation memory row (JSON); path is key in the JSON object.

---

## Storing memory in the database (this project)

This project stores conversation memory in **Postgres**: one row per conversation, with a **JSON column** (`data`). Keys in the JSON are **main** (long-term) and **daily/YYYY-MM-DD** (daily notes). No .md files; no path column. memory_search searches within the JSON values; memory_get and write_file use the key (main or daily/YYYY-MM-DD).

### Alternative: SQLite (e.g. job_id.sqlite)

You can store memory in SQLite instead. One common pattern is **one SQLite file per job/engagement**, e.g. `{job_id}.sqlite`.

### Schema (example)

```sql
-- One DB per job: e.g. workspace/jobs/abc123.sqlite
CREATE TABLE memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,           -- e.g. "main", "daily/2026-02-08"
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Optional: full-text search for memory_search
CREATE VIRTUAL TABLE memory_fts USING fts5(path, content, content='memory', content_rowid='id');
CREATE TRIGGER memory_ai AFTER INSERT ON memory BEGIN
  INSERT INTO memory_fts(rowid, path, content) VALUES (new.id, new.path, new.content);
END;
-- (similar triggers for UPDATE/DELETE)
```

### How tools use it

| Tool | With SQLite |
|------|-------------|
| **memory_search(query)** | `SELECT path, snippet(memory_fts, 2, '…', '…', '…', 32), … FROM memory_fts WHERE memory_fts MATCH ? LIMIT 10` (FTS5), or `SELECT * FROM memory WHERE content LIKE '%' || ? || '%'` (simple). Return path + snippet + row id or line range. |
| **memory_get(path, from?, lines?)** | Read from conversation memory (JSON) by key (main or daily/YYYY-MM-DD). If `from`/`lines` are set, split content by newline and return that line range. |
| **write_file(path, content)** or **memory_append** | `INSERT OR REPLACE INTO memory (path, content, updated_at) VALUES (?, ?, datetime('now'))` for full replace, or `SELECT content FROM memory WHERE path = ?` then `UPDATE memory SET content = content || ? || '\n', updated_at = ... WHERE path = ?` for append. |

### Paths and job_id

- **job_id** can be the engagement or session id. DB path: e.g. `workspace/jobs/{job_id}.sqlite`.
- **path** (key) in the DB: **main** or **daily/YYYY-MM-DD**. Memory is stored in the database (JSON); no .md files.
- When the agent calls memory_search or memory_get, your NestJS service uses the current **job_id** (from session or request) to open the right `job_id.sqlite` and run the query.

### Summary

- **Yes — memory can be stored in SQLite**, e.g. in `job_id.sqlite` (one DB per job).
- Use a **memory** table (path, content, timestamps) and optional **FTS5** for memory_search.
- Implement memory_search as FTS or LIKE over that table; memory_get as SELECT by path (and optional line range in application code). Writing = INSERT/UPDATE on the same table.

---

## Required (writing memory)

The agent must be able to write to conversation memory (database). Use **write_file(path, content)** with path **main** or **daily/YYYY-MM-DD**. No .md files.

### 3a. `write_file(path, content)` (memory)

- **Purpose:** Write or append to conversation memory in the database.
- **path:** **main** (long-term) or **daily/YYYY-MM-DD** (daily notes). Stored as JSON in DB; no .md files.
- **content:** Text to write. Use **append: true** to append (e.g. for daily notes).
- **Output:** `{ ok: true, path }` or error.

### 3b. `memory_append(path, text)` (optional dedicated tool)

- **Purpose:** Append to daily notes.
- **Input:** `path` = **daily/YYYY-MM-DD** (e.g. today only), `text` (string).
- **Behavior:** Append `text` with newline (and optional timestamp). Create key if missing (in DB).
- **Output:** `{ ok: true, path }` or error.

---

## Optional (web pentest)

### 4. `read_file(path)` (general workspace)

- **Purpose:** Read SOUL.md, AGENTS.md, SCOPE.md, or other workspace files if you did not preload them into the system message.
- **Input:** Workspace-relative path.
- **Output:** File content. Restrict to workspace; reject paths like `../etc/passwd`.

### 5. `browser` or `open_url` / `fetch_url`

- **Purpose:** In-scope recon: open a URL, get HTML, take a snapshot or screenshot. Agent uses it for mapping, form discovery, link enumeration.
- **Input:** URL, optional options (e.g. wait for selector, screenshot).
- **Output:** HTML text, or screenshot path, or accessibility tree. **Enforce scope:** only allow URLs that are in SCOPE.md (or your scope allowlist).
- **Implementation:** Playwright (headless Chromium, see Browser section below), or a simple HTTP fetch (no JS). Check URL against in-scope list before running.

### 6. `exec(command)` or `run_shell(command)`

- **Purpose:** Run approved one-liners (e.g. `curl`, `nmap` with safe args, custom scripts). For scans or recon the user has approved.
- **Input:** Command string (or argv array). Optional: `cwd`, `timeout`.
- **Output:** stdout, stderr, exit code. **Enforce scope and allowlist:** only run if target is in scope and command is in an allowlist (e.g. `curl`, `nmap -sV`, not `rm -rf`).
- **Implementation:** Child process or sandboxed runner. Validate command against allowlist; validate target (URL/host) against SCOPE.md before execution.

### 7. `write_file(path, content)` (general workspace)

- **Purpose:** Save findings, reports, or notes. Use write_file (path: main or daily/YYYY-MM-DD) for memory; path for reports as needed.
- **Input:** Workspace-relative path, content. Restrict to workspace; optional allowlist of extensions (e.g. `.md`, `.json`).
- **Output:** `{ ok: true, path }` or error.

---

## Recon, verification, and reporting tools

Optional tools for **reconnaissance**, **vulnerability verification** (not full exploit execution), and **reporting**. All must be **scope-bound**: only in-scope targets; optionally require explicit user approval for verification steps.

### Recon

| Tool | Purpose | Input (example) | Output | Scope |
|------|--------|------------------|--------|--------|
| **fetch_url** / **http_request** | GET/POST/HEAD a URL; inspect response. | `url`, `method`, `headers?`, `body?` | Status, headers, body (or truncated). | URL must be in scope. |
| **crawl_url** | Discover links and forms from a page (same-origin or allowlist). | `url`, `max_pages?`, `same_origin_only?` | List of URLs, forms (action, method, inputs). | Start URL in scope; only follow in-scope links. |
| **subdomain_enum** | Enumerate subdomains (e.g. via passive list or DNS). | `domain` | List of subdomains. | Domain must be in scope. |
| **dir_brute** / **path_brute** | Request common paths (e.g. `/admin`, `/backup`). | `base_url`, `wordlist?`, `status_only?` | Path → status code (and optionally length). | base_url in scope; rate-limit. |
| **port_scan** | Check open ports on a host (e.g. 80, 443, 8080). | `host`, `ports?` | Port → open/closed/filtered. | Host in scope; only allowed ports (e.g. 80, 443, 8080). |
| **headers_inspect** | Fetch URL and return response headers (CORS, CSP, cookies, etc.). | `url` | Headers object. | URL in scope. |
| **tech_detect** | Heuristic tech stack (e.g. from headers, HTML, JS paths). | `url` | List of inferred techs. | URL in scope. |

Implementation: wrap existing tools (curl, ffuf, nmap, dirsearch, etc.) via **exec** with a strict allowlist, or implement HTTP/crawl in NestJS and enforce scope before each request.

### Tools available in the pentest Docker image (Dockerfile.pentest-tools)

When the backend runs **exec** inside the **gwehai-pentest-tools** container, the following tools are **available**. Tell the AI these are the tools it can use.

| Category | Tool | Use for |
|----------|------|--------|
| **Network** | nmap, masscan* | port_scan (e.g. nmap -sV -p 80,443 &lt;host&gt;) |
| **DNS / info** | dig, whois | subdomain_enum, domain info |
| **HTTP** | curl | fetch_url, headers, GET/POST |
| **Recon / scan** | nikto, nuclei, subfinder, httpx, naabu | Web server scan; vuln scanning (nuclei; templates at /opt/nuclei-templates); subdomains, HTTP probe, port discovery |
| **Fuzzing** | **ffuf** | Fuzzing params/paths (use ffuf; wfuzz is not in the image) |
| **Dir brute** | gobuster* or ffuf | Directory/path enumeration (dirsearch not in image) |
| **SQLi** | sqlmap | verify_sqli (e.g. sqlmap -u "URL" --level=1 --risk=1 --batch) |
| **SSL/TLS** | sslyze | SSL/TLS analysis |
| **Other** | git-dumper, rg (ripgrep) | Git dump; grep (rg). John (JOHN=/opt/john/run) for hashes. theHarvester pip package is present but may not expose a CLI in this image. |
| **Browser** | **navigate(url, options?)** | Open URL with Playwright (headless Chromium). Returns: screenshot, page analysis (forms, links, inputs, cookies, CSRF detection). Options: `waitForSelector`, `timeout`, `scope`. Auto rate-limited (1 req/sec). |
| | **auto_login(login_url, username, password, options?)** | Auto-detect login form, fill credentials, submit, capture full auth state (cookies, localStorage, sessionStorage, JWT/bearer token). Returns screenshots (before/after) + auth state. Options: `usernameSelector`, `passwordSelector`, `submitSelector`. |
| | **click(selector, options?)** | Click element on page. Options: `waitForNavigation` (waits for networkidle). Returns screenshot + page analysis. |
| | **type(selector, value, options?)** | Type text into form field. Auto-clears field first. Options: `delay` (typing speed), `clear` (false to append). |
| | **extract(options?)** | Extract content from page. Options: `selector` (CSS selector), `attribute`. Without selector: returns title, URL, body text (5k chars). |
| | **screenshot(options?)** | Capture current page screenshot. Options: `fullPage`. Saves to `$PENTEST_WORKSPACE/screenshots/`. |
| | **analyze_page()** | Full page analysis: detect all forms (action, method, inputs, CSRF tokens), links (with same-origin flag), standalone inputs, cookies. |
| | **test_reflected_xss(formSelector, payload, options?)** | Test reflected XSS via form submission. Fills payload, submits, checks if reflected + if script executed (alert dialog). Returns isReflected + scriptExecuted booleans. |
| | **check_csrf_tokens()** | Scan all forms on current page for CSRF tokens. POST forms without token = HIGH risk. |
| | **get/set/save/load_auth_state** | Auth state persistence: get current state, set from stored creds, save to `storageState` JSON file, load from file for session reuse. |

**Browser config (Playwright):**
- Engine: **Playwright** with `chromium` channel
- Executable: `PLAYWRIGHT_CHROMIUM_PATH` env var, default `/usr/bin/chromium`
- Launch args: `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`, `--disable-web-security`
- Viewport: 1920×1080
- User-Agent: Chrome 120 on Windows 10
- Rate limit: 1 request/second per session
- Session timeout: 30 minutes idle
- Downloads: **blocked** for safety
- Retry: 3 attempts on browser launch failure (2s delay between retries)

**Troubleshooting — Playwright Chrome not found:**
1. Check `PLAYWRIGHT_CHROMIUM_PATH` env var is set correctly
2. Install Chromium: `npx playwright install chromium` or `apt install chromium-browser`
3. In Docker: ensure `chromium` is in the image (`/usr/bin/chromium`)
4. If launch fails after 3 retries → `BrowserLaunchError` is thrown with attempt count
5. Check `--no-sandbox` flag is present (required for root/Docker)
6. Verify `/dev/shm` is large enough (`--disable-dev-shm-usage` helps, but 2GB+ `/dev/shm` is recommended)

\* Optional (installed from apt if available). **wfuzz** and **dirsearch** are **not** in the Docker image — use **ffuf** for fuzzing and path discovery.

### Real CLI tools → template mapping

You **do** use these real tools; the agent calls them via **exec** (or your wrapper tools) with scope checks and an allowlist. Map them as follows:

| Category | Real tool | Maps to (template) | Notes |
|----------|-----------|--------------------|--------|
| **Network scanning** | **nmap** | port_scan | Allowlist args only (e.g. `-sV`, `-sC`, `-p 80,443,8080`). Validate target host against SCOPE. |
| | **masscan** | port_scan | Same: allowlist args; target must be in scope. |
| **Information gathering** | **dig** | subdomain_enum / DNS | DNS queries for domain; domain in scope. |
| | **whois** | (info) | Domain info; domain in scope. |
| **Subdomains / HTTP** | **subfinder**, **httpx**, **naabu** | subdomain_enum, HTTP probe, port discovery | In Docker image. |
| **Web app testing** | **ffuf** | dir_brute / fuzzing | Use ffuf for fuzzing and path discovery (wfuzz/dirsearch not in Docker image). |
| | **gobuster** | dir_brute | If available in image. |
| | **sqlmap** | verify_sqli | **Allowlist only**: e.g. `--level=1 --risk=1`, no `--os-cmd` / `--file-write`. Target URL in scope. |
| | **nikto** | (recon) | Web server scan; URL in scope; run with safe options only. |
| | **nuclei** | (vuln scan) | Template-based scanning; community templates at **/opt/nuclei-templates** — use `nuclei -t /opt/nuclei-templates -u <target>`. Target in scope. |
| **Network / HTTP** | **curl** | fetch_url / http_request | GET/POST/HEAD; URL in scope. Prefer your own fetch_url that checks scope. |
| | **netcat** | (network) | Optional; allowlist args only (e.g. banner grab); target in scope. |
| | **traceroute** | (network) | Route tracing; host in scope. |
| **SSL/TLS** | **sslyze** | (new or exec) | SSL/TLS analysis; host in scope. In Docker image. |

- **Yes — you need to use these** (or equivalents) so the agent can do real recon and verification. Expose them via **exec** with strict allowlists and scope checks, or as **wrapper tools** (e.g. `dir_brute` → ffuf or gobuster).
- **Scope:** Before every exec, ensure the **target** (host, domain, URL) is in SCOPE.md (or your scope store). Reject if not.
- **Allowlist:** Only allow specific commands and flags (e.g. `nmap -sV -p 80,443 <host>`, not `nmap --script=exploit`). For sqlmap, use safe levels and never allow data exfil or OS commands.
- **Docker image (Dockerfile.pentest-tools):** The tools listed in the table above are available in the container. Use **ffuf** for fuzzing (not wfuzz); use **ffuf** or **gobuster** for dir brute (not dirsearch).

**Automation installer:** A shell script **install-tools.sh** in this folder installs tools on Debian/Ubuntu (apt), Fedora/RHEL (dnf), and macOS (Homebrew), plus Python tools via pip/pipx (sqlmap, wfuzz, sslyze, dirsearch). Run: `./install-tools.sh [--skip-pip] [--dry-run]`. **When using the Docker image**, see the "Tools available in the pentest Docker image" table above.

### Verification (vulnerability checks, not full exploit)

Framed as **verification** or **proof-of-concept** only: confirm a finding in a controlled way, do not exfiltrate data or disrupt service. Require **in-scope** and optionally **explicit approval** (e.g. “run verification” from user) before calling.

| Tool | Purpose | Input (example) | Output | Safety |
|------|--------|------------------|--------|--------|
| **test_endpoint** | Send a crafted request (params, headers, body) and return response. | `url`, `method`, `params?`, `headers?`, `body?` | Status, headers, body snippet. | URL in scope. No destructive methods (e.g. DELETE) unless in allowlist. |
| **verify_sqli** | Send a safe SQLi probe (e.g. single quote, sleep(1)) and check response/time. | `url`, `param`, `method` | Boolean or “likely/not likely” + evidence snippet. | URL in scope; use only safe payloads (no DROP, no data exfil). |
| **verify_xss** | Send a safe XSS probe (e.g. `<script>alert(1)</script>`) and check if reflected. | `url`, `param`, `method` | Boolean or “reflected/not reflected” + snippet. | URL in scope; non-persistent only unless explicitly allowed. |
| **verify_auth_bypass** | Test auth (e.g. access protected path with no cookie / wrong cookie). | `url`, `headers?` | Status code, snippet (e.g. “redirect to login” vs “200 OK”). | URL in scope; no brute-force. |
| **verify_ssrf** | Send request to internal URL or callback and check if server issued a request. | `url`, `param`, `callback_url?` | Boolean + evidence. | URL in scope; callback must be your own server; rate-limit. |

Implementation: call your own HTTP client or a small verification service; **never** pass arbitrary payloads from the LLM without validation (allowlist of payload types and targets). Log all verification requests for audit.

### Reporting and evidence

| Tool | Purpose | Input (example) | Output |
|------|--------|------------------|--------|
| **save_finding** | Write a finding to reports or memory (title, severity, description, evidence). **Require evidence** (screenshot and/or request/response) before or with the finding to reduce false positives. | `title`, `severity`, `description`, `evidence?`, `screenshot_path?`, `path?` | `{ ok: true, path }` (e.g. reports or main memory). |
| **screenshot** | Capture a URL and save image under workspace. Use for **evidence** so the report is confirmable (e.g. XSS reflected, SQL error, auth bypass). Implement with Playwright (see below). | `url`, `path?`, `full_page?` | `{ ok: true, path }`. URL in scope. |
| **save_request_response** | Save raw request/response for evidence. Attach to findings so reviewers can confirm. | `request`, `response`, `path?` | `{ ok: true, path }`. |

Implementation: **write_file** (path: main or daily/YYYY-MM-DD for memory) or a dedicated service that writes to reports and conversation memory (DB). **Minimizing false positives** and **screenshot with Playwright** are described below.

### Minimizing false positives

To keep reports credible and actionable:

1. **Verify before reporting** — Only call **save_finding** after a **verification** step (e.g. verify_sqli, verify_xss) has confirmed the issue with an allowlisted payload. Do not report from scanner output alone (e.g. nikto/sqlmap) without re-checking.
2. **Require evidence** — For each finding, require at least one of:
   - **screenshot** of the vulnerable response (e.g. reflected XSS, SQL error, 200 on protected path). This makes the report “possible” to confirm.
   - **save_request_response** (request + response) so reviewers can reproduce.
   Prefer both when feasible. Instruct the agent (e.g. in AGENTS.md / system prompt): “Before save_finding, capture a screenshot of the issue (screenshot tool) and optionally save_request_response; attach paths in the finding.”
3. **Allowlisted verification only** — Verification tools use predefined payloads; no raw LLM-generated exploit strings. Reduces noise and accidental misuse.
4. **Optional human-in-the-loop** — Require explicit user approval (e.g. “proceed with verification” or “add to report”) before save_finding for high-severity or sensitive findings.
5. **Severity only when confirmed** — Mark as “Confirmed” or “High/Medium” only after verification + evidence; keep “Potential” or “Low” for unverified scanner hints.

### Screenshot with Playwright (like OpenClaw)

Use **Playwright** for the **screenshot** tool so the agent can capture in-scope URLs and save images for evidence. Same pattern as OpenClaw’s browser/screenshot.

- **Flow:** Check URL is in scope → launch or reuse a browser (Playwright) → navigate to URL → `page.screenshot({ path, fullPage?: boolean })` → save under workspace (e.g. `reports/evidence/YYYY-MM-DD-<finding-id>.png`) → return path to the agent.
- **Why Playwright:** Renders JS and real browser behavior (cookies, redirects), so screenshots match what a human would see (XSS, error messages, auth bypass). Headless is fine.
- **Dependency:** Use the full **Playwright** package (not only playwright-core) if you need bundled browsers; otherwise `playwright-core` + system Chromium. OpenClaw uses `playwright-core` with CDP; for a standalone pentest service, `playwright` (full) is simpler: `npx playwright install chromium`.
- **Scope:** Validate URL against SCOPE (or your scope allowlist) before navigating. Reject out-of-scope URLs.
- **Options:** Support `full_page: true` for long pages; optional viewport size for consistency. Save as PNG (or JPEG) under `reports/evidence/` or `workspace/screenshots/` and include the path in **save_finding** so the report links to the image.

Example (Node/NestJS): create a small service that receives `{ url, fullPage?, path? }`, checks scope, then `const browser = await chromium.launch(); const page = await browser.newPage(); await page.goto(url); await page.screenshot({ path: resolvedPath, fullPage }); await browser.close();` and return `{ ok: true, path }`.

### Scope and safety for recon/exploit tools

- **Every recon/verification tool** must check that the target (URL, host, domain) is **in scope** (e.g. parse SCOPE.md or query scope allowlist in DB) before running.
- **Verification tools** should use **allowlisted payloads** (e.g. predefined SQLi/XSS probes) rather than raw LLM-generated strings, to avoid accidental destructive or out-of-scope requests.
- Optionally require **explicit user approval** (e.g. “proceed with verification”) before running any verification tool; recon-only tools may be allowed without per-request approval if scope is strict.

---

## Summary table

| Tool | Required? | Purpose |
|------|-----------|--------|
| **memory_search** | Yes | Recall prior targets, findings, preferences from conversation memory (database). |
| **memory_get** | Yes | Read memory by path (main or daily/YYYY-MM-DD) after search. |
| **read_file** | Yes or Optional | Read SCOPE, skills, etc. Memory is in DB only. |
| **write_file** | Yes (for writing memory) | Update conversation memory (path: main or daily/YYYY-MM-DD) or reports. |
| **memory_append** | Optional (alternative to write_file for daily notes) | Append to daily/YYYY-MM-DD only. |
| **browser** / **open_url** | Optional | In-scope recon: fetch page, snapshot, screenshot. |
| **exec** / **run_shell** | Optional | Run approved commands (curl, scanners); enforce scope + allowlist. |
| **Recon** (fetch_url, crawl_url, subdomain_enum, dir_brute, port_scan, headers_inspect, tech_detect) | Optional | In-scope recon only; see “Recon, verification, and reporting tools” above. |
| **Verification** (test_endpoint, verify_sqli, verify_xss, verify_auth_bypass, verify_ssrf) | Optional | In-scope, allowlisted payloads; optionally require user approval. See above. |
| **Reporting** (save_finding, screenshot, save_request_response) | Optional | Save findings and evidence to workspace or DB. See above. |

---

## Using these tools in NestJS

Expose them as **tools** (or **functions**) in your LLM API call. Example shape for OpenAI-style function calling:

```typescript
// Example: tool definitions for OpenAI chat completions
const tools = [
  {
    type: 'function',
    function: {
      name: 'memory_search',
      description: 'Search conversation memory in the database for prior targets, findings, preferences. Use before answering questions about past work or scope.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          max_results: { type: 'number', description: 'Max snippets to return (default 10)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_get',
      description: 'Read memory by path. Use after memory_search to pull only needed chunks. Path: main or daily/YYYY-MM-DD (stored in DB).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Memory path: main or daily/YYYY-MM-DD (stored in DB)' },
          from: { type: 'number', description: 'Start line (1-based)' },
          lines: { type: 'number', description: 'Number of lines to read' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file from the workspace (e.g. SOUL.md, SCOPE.md, or a memory file).',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write or append to conversation memory (path: main or daily/YYYY-MM-DD) or reports. Memory is stored in the database.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  // Optional: browser, exec — add with scope checks before execution
];

// When calling the API
await this.openai.chat.completions.create({
  model: 'gpt-4o',
  messages,
  tools,
  tool_choice: 'auto',
});
```

When the model returns `tool_calls`, run the corresponding tool in your NestJS service (e.g. call your `memorySearchService.search(query)`), then append the tool result as a message and call the API again until the model returns a final reply.

---

## Scope enforcement for optional tools

- **browser / open_url:** Before opening a URL, check that the host/URL is in SCOPE.md (or your parsed scope). Reject with a clear error if out of scope.
- **exec:** Before running, check (1) command is in an allowlist (e.g. `curl`, `nmap` with safe flags), and (2) any target host/URL in the command is in scope. Reject otherwise.

This keeps the agent from running tests or recon outside the defined scope.
