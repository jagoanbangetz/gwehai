---
name: enumeration
description: "Enumeration slice — parameter discovery (query/body), auth surface mapping, light hidden-param fuzzing. Outputs to Parameters.discovered and Endpoints.authenticated_only."
---

# Enumeration Skill

## Purpose

Complete the **Enumeration** stage only: discover parameters (query and body) on discovered endpoints, map authentication surfaces, and perform light hidden-parameter fuzzing. Non-destructive; low-volume only. Outputs feed Verify stage and Pentest State.

## Preconditions

- Target in user-defined scope (recorded in Pentest State).
- **Recon** stage DONE or PARTIAL; `ReconLocked: true`.
- **memory_get**(path: "daily/<target>/<YYYY-MM-DD>") — read Endpoints.discovered, existing Parameters.discovered.
- **memory_search**(query: target + "enumeration" or "parameters discovered") — avoid re-enumerating same endpoints.

## Inputs

- **target URL** (base URL from Pentest State).
- **Endpoints.discovered** from recon (paths/URLs to enumerate).
- **Optional**: session cookies or HAR from auth-journey for authenticated areas.

## Safety Limits

- **Low-volume only**: small param wordlists; no mass brute force.
- **In-scope only**: no exec against out-of-scope hosts.
- **Stop** on 429, WAF block, or lockout; log and continue.
- **No vulnerability exploitation**: enumeration only; no PoC payloads.

## Workflow

### THINK

- Which endpoints from recon have not yet been enumerated for parameters?
- Which auth-related paths exist (login, register, forgot, reset, otp, api/auth)?
- Has memory_search shown prior enumeration for this target? Retest only new endpoints or if user asked.

### ACT

1. **memory_get**(path: "daily/<target>/<YYYY-MM-DD>") — load Pentest State and Work Registry.
2. **Claim** an enumeration task from Work Registry (per MULTI_AGENT_COORDINATION) before any **exec** or **craft_payload**.
3. For each endpoint (or assigned subset):
   - **Parameter identification**: Inspect links, forms, and API docs; list query and body params.
   - **Light fuzzing**: Use **exec**(wfuzz) or **craft_payload**(curl loop) with a **small** param wordlist (e.g. common param names) to find hidden parameters; cap requests per endpoint.
   - **Auth surface mapping**: Identify and list `/login`, `/register`, `/signup`, `/forgot`, `/reset`, `/otp`, `/verify`, `/api/auth`, etc.; tag as `Endpoints.authenticated_only` where applicable.
4. **write_file**(path: "daily/<target>/<YYYY-MM-DD>", content: updated Parameters.discovered, Endpoints.authenticated_only, Artifacts.enumeration; mode: overwrite or append per schema).
5. Update Work Registry: mark task DONE, append to Completed with result_summary and artifact_refs.

### OBSERVE

- Response status and body (param presence, error messages, redirects); new param names from fuzzing; auth endpoints and their methods.

### REFLECT

- Are parameters and auth surfaces sufficiently mapped for Verify to build candidates? If gaps remain, note in Checklist progress and set Enumeration to PARTIAL.
- Only enumeration; no exec of exploit payloads.

### LOG

- **write_file**: Path **daily/<target>/<YYYY-MM-DD>**. Append/update:
  - `Parameters.discovered`: list of (endpoint, param_names).
  - `Endpoints.authenticated_only`: list of paths.
  - `Artifacts.enumeration`: references to logs/HARs.
  - `# Checklist progress`: "Enumeration — params: [endpoints]; auth surfaces: [list]; hidden param fuzz: [brief]."
  - `# Tested vectors`: endpoints and param names tested.
- Do **not** call **report_finding** in this skill (enumeration does not confirm vulnerabilities).

## Confirmation criteria

- Parameters (query/body) are listed for key endpoints.
- Auth-related endpoints are identified and tagged.
- Light hidden-parameter fuzzing has been attempted within safety caps.
- Pentest State and Work Registry are updated; EnumerationLocked set when done.

## Proof requirements

- No vulnerability proof in this stage; artifacts are **parameter lists**, **auth surface lists**, and **enumeration logs** for use in Verify.

## report_finding

- **Not used** in this skill. Enumeration only produces inputs for Verify.

## write_file logging format

- **Path**: `daily/<target>/<YYYY-MM-DD>`.
- **Content**: Update `# Pentest State` → `Parameters.discovered`, `Endpoints.authenticated_only`, `Artifacts.enumeration`; update `# Work Registry` → Completed; update `# Checklist progress` and `# Tested vectors` only if the agent is the **Main Agent** (orchestrator). Subagents write only to Work Registry → Completed and artifact_refs.
