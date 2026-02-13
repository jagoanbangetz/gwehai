---
name: recon
description: "Web recon — map targets, extract URLs/forms/params, enumerate paths, and snapshot headers/tech. Safe, low-impact. Use memory_search first; enforce scope and ReconLocked rules."
---

# Recon Skill (Web Pentest)

Use this skill when the user asks to **recon** a target, **map** a site, **enumerate** paths or subdomains, or **check** headers and technology.

This skill focuses on **safe, low-impact reconnaissance** and building a high-quality Pentest State:

- `Endpoints.discovered` (URLs/paths + tags)
- `Parameters.discovered` (path → param names)
- `Artifacts.recon.*` (headers/tech/WAF/robots/sitemap/JS summaries)
- `# Tested vectors` and `# Checklist progress` (via the orchestrator)

---

## Preconditions & Scope

- **Scope enforcement**
  - Preferably confirm scope via **memory_get(path: "SCOPE.md")** if present, and/or user instructions.
  - Target **must be explicitly in-scope** according to the user and the Pentest State (`daily/<target>/<YYYY-MM-DD>`).
  - If scope is unclear: **ask the user** before calling **exec**.

- **Pentest State & ReconLocked**
  - Use **memory_get(path: "daily/<target>/<YYYY-MM-DD>")** (Pentest State + Work Registry as defined in `PENTEST_WORKFLOW.md`).
  - If `Locks.ReconLocked: true`:
    - **Do NOT run full recon again.**
    - Only perform **Targeted Recon** when there is a valid unlock trigger:
      - New in-scope host/subdomain discovered later.
      - Successful login exposes new surface (e.g. new domain/hostname).
      - User explicitly asks to redo recon.
      - Scope changes (user updates/expands scope).
    - In targeted mode, only touch the **new surface**; do not repeat earlier scans.

- **Duplicate recon avoidance**
  - Always run **memory_search** first:
    - `memory_search(query: "<target> recon" or "<target> headers" or "<target> endpoints", max_results: 10)`
  - If prior recon already covers the same host/surface and `ReconLocked` is true, only run Targeted Recon as described above.

---

## URL Normalization & Deduplication Rules

When collecting endpoints, always **normalize** and **deduplicate** them:

- **Normalization**
  - Strip URL fragments: remove anything after `#`.
  - Lowercase the **host** (`Example.COM` → `example.com`).
  - Resolve **relative URLs** against the base URL:
    - `"/path"` → `https://example.com/path` (assuming base).
    - `"../foo"` resolved using standard URL resolution rules.
  - Remove **common tracking parameters**:
    - `utm_*` (e.g. `utm_source`, `utm_campaign`)
    - `fbclid`, `gclid`, `mc_cid`, `mc_eid`, etc.
  - Sort query parameters **by key** to get a canonical form:
    - `?b=2&a=1` → `?a=1&b=2`.

- **Endpoint identity**
  - Deduplicate by tuple:
    - `(method, normalized_path_with_query_keys, param_names)`
    - Example:
      - `GET https://example.com/search?q=foo&page=1`
      - Normalized path: `/search?q=&page=`
      - Param names: `[q, page]`
  - Ignore differences only in tracking params or query ordering.

---

## Output Targets in Pentest State

Recon must **append** (via **write_file**) to `daily/<target>/<YYYY-MM-DD>`:

- **Pentest State:**
  - `Endpoints.discovered`:
    - For each endpoint:
      - `method` (e.g. GET/POST/HEAD).
      - `url` (normalized, absolute).
      - `source` (e.g. `html_link`, `html_form`, `robots.txt`, `sitemap.xml`, `js`, `dirsearch`).
      - `tags` (array of strings, e.g. `["auth_surface"]`, `["admin_candidate"]`, `["api_candidate"]`, `["graphql_candidate"]`).
      - `requires_auth` (true | false | unknown).
  - `Parameters.discovered`:
    - Mapping: `path` (normalized without tracking params) → `[param_name1, param_name2, ...]` from:
      - query strings
      - forms

- **Artifacts.recon (summaries only):**
  - `headers_snapshot`
  - `tech_stack_guess`
  - `waf_hints`
  - `robots_summary`
  - `sitemap_summary`
  - `js_endpoints_summary`

- **Tested vectors & checklist:**
  - Under `# Tested vectors` and `# Checklist progress`:
    - Note which commands were run (curl for headers, curl for HTML, dirsearch, robots/sitemap fetch, JS harvesting).
    - This is updated by the **Main Agent/orchestrator** (sub-agents only write task results in `Work Registry → Completed`).

---

## Steps

### 1. Map the Site & Extract URLs/Forms

1. **Fetch base URL (safe)**
   - Use **exec** with curl:
     - Example: `curl -sL -D - "<BASE_URL>"`  
       (captures headers + follow redirects, low volume).
   - Note:
     - Final URL and redirect chain (301/302).
     - Status code and basic response size.

2. **HTML parsing via craft_payload** (no raw HTML storage)
   - Use **craft_payload** with a small script (e.g. Python) that:
     - Reads HTML from stdin (or a variable).
     - Extracts:
       - `<a href="...">` and `<link href="...">` URLs.
       - `<form>` elements:
         - `action` URL
         - HTTP `method`
         - Child inputs (`<input name="...">`, `<textarea name="...">`, `<select name="...">`).
       - `<script src="...">` JS URLs.
     - Normalizes links:
       - Resolve relative URLs against base.
       - Strip fragments, normalize host, sort query params, strip tracking params.
     - Outputs only:
       - `URL: <normalized> | source=html_link`
       - `FORM: <normalized_action> | method=POST | params=[user,password]`
       - `JS: <normalized_js_url> | source=html_script`
   - Only a **summary** (list of endpoints and form params) is kept; **no raw HTML** is written to memory.

3. **Update Pentest State**
   - For each discovered URL/form:
     - Add an entry to `Endpoints.discovered` (deduplicated, normalized).
     - Add/update `Parameters.discovered[path]` with new param names from forms and URLs with `?`.
   - Tag obvious **auth and admin surfaces** (see “Auth Surface Tagging” below).

---

### 2. Robots.txt & Sitemap Parsing

1. **robots.txt**
   - Use **exec**:
     - `curl -s "<BASE_URL>/robots.txt"`
   - If present:
     - Parse lines starting with `Disallow:` (and optionally `Allow:` if useful).
     - Normalize those paths to full URLs.
     - Add them to `Endpoints.discovered` with:
       - `source: "robots.txt"`
       - Tag: `["robots_disallow"]`
   - Summarize:
     - Count of Disallow entries.
     - Top few entries that look interesting (admin, backup, staging, api, etc.).
   - Store summary in `Artifacts.recon.robots_summary`.

2. **sitemap.xml**
   - Use **exec**:
     - `curl -s "<BASE_URL>/sitemap.xml"`
   - If present and reasonably sized (e.g. not huge):
     - Parse `<loc>` elements and normalize to full URLs.
     - Add each to `Endpoints.discovered` with:
       - `source: "sitemap.xml"`
   - Summarize:
     - Total number of `<loc>` URLs seen.
     - Representative interesting URLs (auth pages, admin paths, APIs).
   - Store summary in `Artifacts.recon.sitemap_summary`.

---

### 3. Path Enumeration (Dirs/Files) – Safe

1. Use **dirsearch** via **exec** (or another approved tool) with **modest settings**:
   - Example:
     - `dirsearch -u "<BASE_URL>" -e php,asp,aspx,js,json -t 10 --timeout=10 --max-retries=1`
   - Keep:
     - Threads low (e.g. 5–10).
     - Timeout short.
     - No aggressive wordlists or recursion unless user approves.

2. For each useful path found:
   - Normalize URL.
   - Record in `Endpoints.discovered` with:
     - `source: "dirsearch"`
   - Tag:
     - `["admin_candidate"]` if it matches common admin patterns.
     - Other tags as appropriate.

3. Summarize dirsearch output:
   - Number of hits.
   - Notable endpoints (admin, login, upload, api, etc.).

No raw dirsearch logs should be stored; only summarized endpoints and counts.

---

### 4. JS Endpoint Harvesting (Light)

1. Start from JS URLs collected in step 1:
   - Limit to a **small subset** (e.g. first 10–20 JS files).

2. For each selected JS URL:
   - Use **exec** with curl:
     - `curl -s "<JS_URL>"`  
       (with a **size/time limit**; if file is huge, skip).
   - Use **craft_payload** (e.g. regex-based in Python) to extract:
     - `"/api/..."` paths.
     - Absolute API base URLs (`https://api.<host>`, `https://<host>/api/`).
     - `/graphql` endpoints.
     - `ws://` or `wss://` endpoints.
     - Lines containing keywords: `"debug"`, `"staging"`, `"dev"`, `"beta"`.
   - For each extracted endpoint:
     - Normalize and add to `Endpoints.discovered` with:
       - `source: "js"`
       - Tag `["api_candidate"]`, `["graphql_candidate"]`, or `["websocket_candidate"]` as appropriate.

3. Summarize JS findings:
   - Count of JS files scanned.
   - Count of API/GraphQL/WebSocket endpoints found.
   - Any obvious environment indicators (debug/staging/dev).
   - Store summary as `Artifacts.recon.js_endpoints_summary`.

**Do not** store or paste full JS bodies into memory.

---

### 5. Query Parameter Harvesting

1. For each URL in `Endpoints.discovered` (from HTML, robots, sitemap, dirsearch, JS):
   - If it contains a `?`, parse query parameters.
   - Remove tracking params (`utm_*`, fbclid, gclid, etc.) from consideration.
   - Record parameter names for that path.

2. Merge into `Parameters.discovered`:
   - Key: normalized path (without tracking params but keeping structure).
   - Value: unique list of param names from:
     - query strings
     - forms (from HTML) where `name` attributes exist.

This provides a consolidated list of parameters feeding into Enumeration/Verify stages.

---

### 6. Auth Surface Tagging

For each endpoint in `Endpoints.discovered`:

- **Auth surfaces**
  - If path matches auth-like patterns:
    - `/login`, `/signin`, `/sign-in`, `/auth/login`, `/register`, `/signup`, `/sign-up`,
    - `/forgot`, `/forgot-password`, `/reset`, `/password/reset`,
    - `/otp`, `/verify`, `/2fa`, `/mfa`
  - Add tag: `["auth_surface"]`.

- **Admin candidates**
  - If path suggests admin/management:
    - `/admin`, `/manage`, `/console`, `/dashboard`, `/staff`, `/backoffice`
  - Add tag: `["admin_candidate"]`.

- **requires_auth**
  - For key endpoints (especially those tagged above), optionally send a **HEAD** or **GET** request with curl:
    - If you see 302 → login page or 401/403 consistently:
      - Set `requires_auth = true`.
    - If 200/OK without obvious login redirect:
      - `requires_auth = false` (or keep `unknown` if not sure).
  - This must be done sparingly (no heavy probing).

---

### 7. API Style & Content-Type Fingerprinting

1. For selected endpoints (especially APIs and auth surfaces):
   - Use **exec** with curl:
     - `curl -sI "<URL>"`
   - Record the **Content-Type**:
     - `text/html`
     - `application/json`
     - `application/xml` or `text/xml`
     - `multipart/form-data`
     - others as relevant.

2. Tag endpoints:
   - `graphql_candidate`:
     - Path includes `/graphql` **or**
     - JSON responses containing GraphQL-specific fields (if already observed).
   - `file_upload_candidate`:
     - HTML forms or endpoints where method is POST and `enctype="multipart/form-data"`.
     - Or Content-Type hints at `multipart/form-data`.
   - `xml_candidate`:
     - Content-Type is `application/xml` or `text/xml`.

Tags are stored in `Endpoints.discovered[*].tags` to guide later skills (`graphql`, `file-upload`, `xxe`, etc.).

---

### 8. Security Posture Snapshot (Non-Intrusive)

1. Use **exec** with curl for headers (already in Step 3):
   - `curl -sI "<BASE_URL>"`

2. Capture presence/absence (and notable values) of:
   - `Content-Security-Policy` (CSP)
   - `Strict-Transport-Security` (HSTS)
   - `X-Frame-Options`
   - `X-Content-Type-Options`
   - `Referrer-Policy`
   - `Permissions-Policy` (or Feature-Policy)

3. Note obvious version leaks:
   - `Server: Apache/2.4.41 (Ubuntu)`
   - `X-Powered-By: PHP/7.4.3`, `ASP.NET`, etc.

4. Store a compact summary as:
   - `Artifacts.recon.headers_snapshot` (e.g. small JSON-ish or key-value list).
   - `Artifacts.recon.tech_stack_guess` (e.g. "nginx + PHP; WordPress; MySQL probable").
   - `Artifacts.recon.waf_hints` (if any header names or error pages suggest a WAF).

No full header dumps; only key fields and their status.

---

## Recon Completion Criteria & Stage Lock

Recon is considered **DONE** for a given target/surface when:

- Base URL fetched and **redirect chain noted**.
- `robots.txt`:
  - Fetched (if present) and **parsed**; Disallow paths added to `Endpoints.discovered`.
- `sitemap.xml`:
  - Fetched (if present) and **parsed**; `<loc>` URLs added.
- Path enumeration:
  - Run via **dirsearch** (or safe fallback curl loop) with modest settings.
- URL & form extraction:
  - Performed on base HTML and at least key pages (especially any auth pages discovered).
- JS harvesting:
  - Performed on a **limited subset** of JS files (10–20) to find API endpoints and environment hints.
- Pentest State updated:
  - `Endpoints.discovered` populated with normalized URLs + tags.
  - `Parameters.discovered` contains path → param names from URLs + forms.
  - `Artifacts.recon.headers_snapshot`, `tech_stack_guess`, `waf_hints`, `robots_summary`, `sitemap_summary`, `js_endpoints_summary` written.
- `# Tested vectors` and `# Checklist progress` (by Main Agent) reflect:
  - Headers check
  - robots/sitemap parsing
  - Path enumeration
  - URL/form/JS harvesting

Once these conditions are met, the orchestrator may set:

- `Stage.Recon: DONE` (or `PARTIAL` if some items were impossible due to scope/time).
- `Locks.ReconLocked: true` to prevent full recon from re-running.

**Targeted Recon** is only allowed later when:

- New in-scope host/subdomain appears.
- New authenticated surface (e.g. new domain) is unlocked.
- User explicitly asks for recon redo.
- Scope changes.

In Targeted Recon, only update `Endpoints`/`Parameters`/Artifacts for the **new surface**, and do not repeat previous work.

---

## Example Commands (Safe)

- **Base fetch with headers + redirects:**
  - `curl -sL -D - "https://example.com"`
- **Headers only:**
  - `curl -sI "https://example.com"`
- **robots.txt:**
  - `curl -s "https://example.com/robots.txt"`
- **sitemap.xml:**
  - `curl -s "https://example.com/sitemap.xml"`
- **dirsearch (modest):**
  - `dirsearch -u "https://example.com" -e php,asp,aspx,js,json -t 10 --timeout=10 --max-retries=1`

---

## craft_payload Parser Outline (Examples)

You may use **craft_payload** to run small scripts. Examples (pseudocode, not stored verbatim):

- **Link + form + JS extraction (HTML):**

```python
# Pseudocode outline for craft_payload
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, parse_qs

html = INPUT_HTML
base = BASE_URL

soup = BeautifulSoup(html, "html.parser")

links = []
forms = []
scripts = []

for a in soup.find_all("a", href=True):
    url = urljoin(base, a["href"])
    links.append(url)

for f in soup.find_all("form"):
    action = urljoin(base, f.get("action") or base)
    method = (f.get("method") or "GET").upper()
    params = [i.get("name") for i in f.find_all(["input","textarea","select"]) if i.get("name")]
    forms.append((action, method, params))

for s in soup.find_all("script", src=True):
    js_url = urljoin(base, s["src"])
    scripts.append(js_url)

# Then normalize URLs, strip fragments, etc., and print summaries.
```

- **Query param extraction (from URLs):**

```python
from urllib.parse import urlparse, parse_qs

def get_params(url):
    q = urlparse(url).query
    return list(parse_qs(q).keys())
```

- **JS endpoint extraction (regex-based):**

```python
import re

js = JS_CONTENT
api_paths = re.findall(r'"/api/[A-Za-z0-9_./-]*"', js)
graphql = re.findall(r'"/graphql[^"]*"', js)
ws = re.findall(r'"wss?://[^"]+"', js)
# Also search for debug/staging/dev strings.
```

Only the **extracted endpoints and param names** should be written to memory, never the full raw contents.

---

## THINK / ACT / OBSERVE / REFLECT / LOG

### THINK

- Is the target clearly in-scope?
- Has Recon already been done and `ReconLocked` set to true?
  - If yes, do you have a valid reason for Targeted Recon (new host/surface, scope change, user request)?
- Which parts of recon are missing:
  - robots/sitemap?
  - dir/path enumeration?
  - URL/form/JS harvesting?
  - headers/security snapshot?

### ACT

1. **memory_search** for prior recon on this target.
2. **memory_get** Pentest State at `daily/<target>/<YYYY-MM-DD>`.
3. If `ReconLocked: true` and no unlock trigger → **do not re-run full recon**.
4. Run safe recon steps as needed:
   - curl base headers/body.
   - robots.txt and sitemap.xml parsing.
   - dirsearch (modest).
   - HTML parsing via craft_payload to extract URLs/forms/JS.
   - Light JS endpoint harvesting.
5. Normalize & deduplicate endpoints and params; update Pentest State via **write_file**.
6. Ensure Artifacts.recon summaries are written.
7. Allow orchestrator to update `# Checklist progress`, `# Tested vectors`, and `Locks.ReconLocked` when DONE.

### OBSERVE

- How many endpoints and params did you discover?
- Did robots/sitemap reveal hidden or sensitive paths?
- Did JS harvesting reveal APIs, GraphQL, WebSocket endpoints, or environment hints?
- What does the header/security posture look like?
- Any obvious WAF or version-disclosure hints?

### REFLECT

- Are recon DONE criteria satisfied for this target/surface?
- Did you stay within safety limits (no heavy brute force, no huge downloads)?
- Are endpoints and parameters stored in a way that later stages (Enumeration/Verify/auth skills) can easily reuse without re-discovery?

### LOG

- Use **write_file** to:
  - Append updated Pentest State (`Endpoints.discovered`, `Parameters.discovered`, `Artifacts.recon.*`).
  - Provide short checklist notes:
    - e.g. `Checklist progress: Recon — base, headers, robots, sitemap, dirs, urls/forms/js harvested.`
  - Add a line to `# Tested vectors` describing which tools and scripts were used (curl, dirsearch, craft_payload parsers).
