---
name: api-docs
description: "Read API documentation for REST/API targets — fetch /docs, /swagger, /openapi.json and summarize endpoints and parameters so pentest can test the real API surface. Do not skip this when the target is an API."
---

# API Docs Skill (Read API Documentation)

Use this skill when the **target is an API** or the user says the target is an API (e.g. "pentest this API", "this is api", URL contains `rest.`, `/api`, `/docs`, or similar). **Do not skip reading API documentation** for API targets—the AI must fetch and parse the docs so later phases (recon, input_handling, auth) test the **real endpoints and parameters** from the spec.

Examples of API targets: `http://rest.vulnweb.com/`, `https://api.example.com/`, any URL where the user explicitly says "API" or "REST".

---

## Why This Matters

- Many APIs expose **OpenAPI/Swagger** docs at `/docs`, `/swagger`, `/openapi.json`, `/swagger.json`, or `/api-docs`.
- Without reading the docs, the AI may only guess endpoints and miss **authenticated routes, request bodies, and parameters**.
- Reading the docs gives: **paths, HTTP methods, parameters (query/body/header), auth requirements**, and sometimes example requests—so testing (SQLi, auth bypass, IDOR, etc.) is accurate and complete.

---

## When to Use

- **User says the target is an API** (e.g. "please pentest this API", "this one is api", "REST API").
- **Target URL suggests an API** (e.g. `rest.vulnweb.com`, `api.example.com`, path contains `/api` or `/v1`).
- **During recon for that target:** before or right after base URL fetch, **always try to load API documentation** from common doc paths.

Do **not** skip this step when the user has indicated an API target. Load **memory_get(path: "skills/api-docs/SKILL.md")** and then fetch the doc URLs below.

---

## Common API Doc Paths (Try in Order)

Fetch with **exec** and **curl** (within scope). Try these relative to the **base URL** (e.g. `https://rest.vulnweb.com`):

| Path | Typical format |
|------|----------------|
| `/docs` | HTML doc page (e.g. Swagger UI) or redirect to doc |
| `/docs/` | Same |
| `/swagger` | Swagger UI HTML |
| `/swagger-ui` | Swagger UI |
| `/swagger.json` | OpenAPI JSON |
| `/openapi.json` | OpenAPI 3.x JSON |
| `/api-docs` | Swagger/OpenAPI UI or JSON |
| `/v1/docs` | Versioned docs |
| `/api/docs` | API docs |
| `/openapi` | OpenAPI JSON or UI |

Use **exec** with curl, e.g.:

- `curl -sL "https://<BASE>/docs/"`  
- `curl -sL "https://<BASE>/swagger.json"`  
- `curl -sL "https://<BASE>/openapi.json"`

If the response is **HTML** (e.g. Swagger UI), look for:
- Links or script tags pointing to a **JSON spec** (e.g. `url: "/swagger.json"` or `spec-url`) and fetch that URL.
- In-page summaries of paths/methods; you can use **craft_payload** to parse HTML and extract endpoint lists if needed.

If the response is **JSON** (OpenAPI/Swagger 2 or 3):
- Parse `paths` (and optionally `servers` for base URL).
- For each path and method: record **path**, **method** (GET/POST/PUT/DELETE/etc.), **parameters** (query, body, header), **security** (auth required or not).
- Summarize in Pentest State (see Output targets below).

---

## Steps

### 1. Identify Base URL and Scope

- Base URL = in-scope API root (e.g. `http://rest.vulnweb.com/`).
- Ensure the target is in **Pentest State** scope (allowed_hosts, allowed_urls).

### 2. Fetch Common Doc URLs

For each of the paths above (in order), run:

- `curl -sL -w "\\n%{http_code}" "<BASE><path>"`

If you get **200** and a body:
- If **Content-Type** is `application/json` (or body starts with `{`): treat as OpenAPI/Swagger JSON → go to Step 3.
- If **Content-Type** is `text/html`: treat as doc UI → try to find a spec URL (e.g. in `<script>` or `spec-url`) and fetch that; otherwise summarize from the page if possible (e.g. list of endpoints visible in UI).

Stop after you **successfully** get a usable doc (JSON spec or clear endpoint list). No need to try every path if the first one works.

### 3. Parse OpenAPI/Swagger JSON

If you have a JSON spec:

- **OpenAPI 3**: `paths` is an object; each key is a path (e.g. `/user/list`), each value has method keys (`get`, `post`, ...). Parameters may be in `parameters` array or in `requestBody`.
- **Swagger 2**: Same idea: `paths` → path → method → `parameters`.

Use **craft_payload** (e.g. Python) to:
- Read the JSON (from curl output).
- Extract: for each path and method, list **(path, method, parameter names and locations)**.
- Optionally note **security** (e.g. `security: [{}]` or specific schemes).

Output a **short structured summary**, e.g.:

- `Endpoint: GET /user/list — query: [limit, offset]`
- `Endpoint: POST /user/ — body: application/json — [name, email, password]`
- `Endpoint: GET /user/{id} — path: id`

Do **not** store the full raw JSON in memory; only the **summary** (endpoints + params + auth hints).

### 4. Write to Pentest State

Append (via **write_file**) to `daily/<target>/<YYYY-MM-DD>`:

- **Artifacts.recon.api_docs_summary** (or a dedicated section you use for API docs):
  - `doc_url`: URL that returned the spec (e.g. `https://rest.vulnweb.com/swagger.json`).
  - `endpoints`: list of `{ path, method, params: [names], location: query|body|path|header, auth_required: true|false|unknown }`.
  - `notes`: e.g. "OpenAPI 3.0; 12 endpoints; auth: Bearer token suggested."

- **Endpoints.discovered**: for each endpoint from the spec, add an entry with:
  - `method`, `url` (full URL if you have base, or path + base), `source: "api_docs"`, `tags: ["api_candidate"]`.
- **Parameters.discovered**: for each path that has parameters, add path → list of param names (from the spec).

This allows **recon** and **input_handling** (and auth/access-control) to use **real** API endpoints and parameters instead of guessing.

### 5. If No Standard Doc Is Found

- If none of the common paths return a spec or useful HTML, note in Pentest State: `Artifacts.recon.api_docs_summary: { doc_url: null, note: "No OpenAPI/Swagger doc found at common paths; will rely on enumeration." }`.
- Then continue with normal recon (e.g. probing `/api/*`, fuzzing, or following links from base URL). Do not block the pentest—but for clearly stated API targets, **always try** the doc paths first.

---

## Example Commands

- Fetch doc page:  
  `curl -sL "http://rest.vulnweb.com/docs/"`
- Fetch OpenAPI JSON:  
  `curl -sL "http://rest.vulnweb.com/swagger.json"`  
  `curl -sL "http://rest.vulnweb.com/openapi.json"`
- Check response type:  
  `curl -sI "http://rest.vulnweb.com/docs/"`

---

## Integration with Recon and Testing

- **Recon:** After (or as part of) base URL fetch, run this skill for API targets; merge discovered endpoints/params into `Endpoints.discovered` and `Parameters.discovered`.
- **Input handling / Auth / Access control:** Use the API docs summary to choose **real** paths and parameters for SQLi, auth bypass, IDOR, and other tests—e.g. "POST /user/ with body params name, email, password" instead of guessing.

---

## THINK / ACT / OBSERVE / REFLECT / LOG

### THINK

- Is the target explicitly an API (user said "API" or URL suggests REST/api)?
- Have I already fetched and parsed API docs for this base URL? (Check memory/Pentest State.)
- Which doc path should I try first? (Usually `/docs/`, `/swagger.json`, `/openapi.json`.)

### ACT

1. **memory_get(path: "daily/<target>/<YYYY-MM-DD>")** to check for existing api_docs_summary.
2. If missing and target is API: **exec** with curl to fetch `/docs/`, `/swagger.json`, `/openapi.json` (etc.).
3. If JSON: parse with **craft_payload**; extract paths, methods, parameters.
4. **write_file** to Pentest State: `Artifacts.recon.api_docs_summary`, and update `Endpoints.discovered` and `Parameters.discovered` from the spec.

### OBSERVE

- Which URL returned the spec? How many endpoints and parameters?
- Are there auth requirements (e.g. Bearer, API key) mentioned in the spec?

### REFLECT

- Did I skip reading docs for an API target? If the user said "this is API" or the URL is clearly an API, this skill must be used.
- Is the summary enough for later phases to test the real API surface?

### LOG

- **write_file** to `daily/<target>/<YYYY-MM-DD>`: api_docs_summary and any new Endpoints/Parameters from the spec.
- In checklist progress: e.g. "API docs: fetched from /docs/ and /swagger.json; 12 endpoints and 8 params recorded."
