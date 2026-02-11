# Web Pentest Checklist & Stage Orchestrator

Use this file as the **orchestrator** for full web application assessments. It implements the **stage-driven pentest workflow** defined in `skills/PENTEST_WORKFLOW.md`:

1. **SCOPE**
2. **RECON**
3. **ENUMERATION**
4. **VULNERABILITY ANALYSIS + VERIFY (PoC)**
5. **REPORT**

The orchestrator must:

- Always respect the **scope explicitly agreed with the user** and the global hard rules.
- Use a **single canonical state file** per target/day at `daily/<target>/<YYYY-MM-DD>`.
- Decide which **stage** to run next based on the Pentest State.
- Load only the **relevant skills** for the current stage.
- Update **locks**, **artifacts**, and **findings** via **write_file** to keep the state machine consistent.

---

## Stage Router (Pentest Workflow)

The **Stage Router** controls which stage runs next. At the start of each interaction:

1. Determine the **target** (e.g. `example.com`) and **date** (e.g. `2026-02-11`).
2. Read or initialize Pentest State:
   - Attempt `memory_get(path: "daily/<target>/<YYYY-MM-DD>")`.
   - If missing, create a new skeleton with all fields required in `PENTEST_WORKFLOW.md` using **write_file**.

Then apply the following logic **in order**:

- **If `Stage.Scope` is not `DONE`**  
  → Run **Scope** stage only (no exec).  
  - Confirm scope, set `Scope confirmed: true|false`.  
  - Update `Stage.Scope` to `DONE` and persist.

- **Else if `Stage.Recon` is not `DONE` and `Locks.ReconLocked` is `false`**  
  → Run **Recon** stage.  
  - Use recon skill(s) and tools listed in `PENTEST_WORKFLOW.md`.  
  - When Recon completion criteria are met, set `Stage.Recon` to `DONE` or `PARTIAL` and `ReconLocked: true`.

- **Else if `Stage.Enumeration` is not `DONE` and `Locks.EnumerationLocked` is `false`**  
  → Run **Enumeration** stage.  
  - Use enumeration logic and any necessary skills (auth-journey, ui-flow, etc.).  
  - When Enumeration completion criteria are met, set `Stage.Enumeration` to `DONE` or `PARTIAL` and `EnumerationLocked: true`.

- **Else if `Stage.Verify` is not `DONE` and `Locks.VerifyLocked` is `false`**  
  → Run **Verify** stage.  
  - Build and process `Findings.candidates` using the appropriate vulnerability skills (sqli/xss/idor/csrf/etc.).  
  - When all current candidates are processed or scope/time exhausted, set `Stage.Verify` to `DONE` or `PARTIAL` and `VerifyLocked: true`.

- **Else**  
  → Run **Report** stage.  
  - Ensure all confirmed findings were reported via **report_finding**.  
  - Summarize coverage, gaps, and blocked areas; set `Stage.Report` to `DONE`.

**Locking behavior**

- Once a stage is marked **DONE** and its lock flag set to `true`, the orchestrator must **not** rerun that stage’s heavy actions.
- Earlier stages may only be **temporarily unlocked** and re-run in a **targeted** fashion when an allowed unlock trigger occurs (see below).

---

## Unlock Triggers (Targeted Re-runs Only)

Allowed triggers to temporarily unlock a previous stage:

- **Scope change or user request**:
  - User updates/clarifies scope in conversation, or explicitly asks to redo Scope/Recon/Enumeration/Verify.
- **New host/subdomain discovered**:
  - New in-scope host or subdomain appears that has not yet undergone recon/enumeration.
- **New authenticated surface**:
  - Successful login exposes new endpoints not previously in `Endpoints.discovered` or `Endpoints.authenticated_only`.
- **Verify discovers new routes/params**:
  - During Verify, brand-new routes or parameters emerge that are not in `Endpoints` or `Parameters.discovered`.

When a trigger occurs:

1. Identify the **minimal stage** to unlock (Recon or Enumeration, sometimes Verify).
2. Temporarily set that stage’s status to `IN_PROGRESS` and its lock flag to `false`.
3. Perform **targeted work** only for the new host/surface/params.
4. Merge new artifacts into the existing Pentest State:
   - Append to `Artifacts`, `Endpoints`, `Parameters`, and/or `Findings.candidates`.
5. Re-lock the stage:
   - Set status back to `DONE` or `PARTIAL` and the corresponding lock flag to `true`.
6. Document the trigger and targeted work in `# Checklist progress` and `# Tested vectors`.

Do not reset a stage completely or re-run all heavy scanning for areas that are already covered unless the **user explicitly requests** a full redo.

---

## Multi-Agent Router (Task Mapping & Coordination)

When the user explicitly requests **multiple agents** (e.g. “work with 3 agents”) or when the workload is **large** (many endpoints/parameters/candidates), the orchestrator should:

1. Ensure the canonical state file at `daily/<target>/<YYYY-MM-DD>` includes:
   - `# Pentest State` (with Stage and Locks).
   - `# Work Registry` (Active Agents, Task Queue, Claims, Completed).
2. Confirm which **stage** is current via the Stage Router (Scope → Recon → Enumeration → Verify → Report).
3. Use `sessions_spawn(role/title)` to create sub-agents for that stage.
4. Create appropriate **TASK_IDs** in the Work Registry:
   - Recon tasks (headers/tech/robots/dirsearch/WAF).
   - Enumeration tasks (params/auth surface/API mapping).
   - Verify tasks (SQLi/XSS/IDOR/CSRF/Logic/etc.).
5. Send each sub-agent a **structured message** (via `sessions_send`) that includes:
   - Target, current Stage.
   - Assigned TASK_IDs.
   - Safety caps for that stage and skills.
   - Required outputs (what to write into Work Registry and Pentest State).
   - Explicit instruction: **“Do not run anything unless you successfully claim the task in the Work Registry.”**

Each sub-agent must:

- Read `daily/<target>/<YYYY-MM-DD>` (Pentest State + Work Registry) using **memory_get**.
- For each assigned TASK_ID:
  - Follow the **claim protocol** from `skills/MULTI_AGENT_COORDINATION.md` before using **exec** or **craft_payload**.
  - If a matching task is already `IN_PROGRESS` or `DONE`, skip it.
  - Otherwise, claim, run, and then update:
    - `Task Queue` (status, owner).
    - `Claims` (lock details).
    - `Completed` (result summary, artifact_refs).
- Respect all stage locks and global rules (scope, non-destructive, proof required).

The orchestrator should:

- Use `sessions_list()` and `sessions_history(session_id)` to monitor sub-agents.
- Merge results into:
  - `Artifacts.*`, `Endpoints.*`, `Parameters.discovered`,
  - `Findings.candidates`, `Findings.confirmed`,
  - `# Checklist progress`, `# Tested vectors`.
- Apply the **finding de-duplication** rules from `skills/MULTI_AGENT_COORDINATION.md`:
  - Only one agent should call **report_finding** for a unique `FINDING_KEY`.

---

## Skill Router (within a Stage)

After the Stage Router chooses the **current stage**, use the **Skill Router** to load only the most relevant skill for the specific task in that stage.

Load skills via **memory_get(path: "skills/<path>")**. Do not load multiple skills for one sub-step unless explicitly needed (e.g. post-login-acl after ui-flow for cookies).

| Trigger / Checklist step | Load this skill only |
|--------------------------|----------------------|
| Recon, map site, enumerate paths, headers, tech | **skills/recon/SKILL.md** |
| Verify a potential finding (SQLi/XSS/etc.) | **skills/verify/SKILL.md** |
| SQL injection testing | **skills/sqli/SKILL.md** |
| XSS (reflected or stored) | **skills/xss/SKILL.md** |
| LFI / path traversal | **skills/lfi/SKILL.md** |
| Command injection | **skills/command-injection/SKILL.md** |
| Open redirect | **skills/open-redirect/SKILL.md** |
| HTTP header injection | **skills/header-injection/SKILL.md** |
| XXE (XML endpoints) | **skills/xxe/SKILL.md** |
| NoSQL injection | **skills/nosql-injection/SKILL.md** |
| IDOR (tamper user/id to access other's data) | **skills/idor/SKILL.md** |
| Authentication journey (register, login, session, reset) | **skills/auth-journey/SKILL.md** |
| CSRF on state-changing actions | **skills/csrf/SKILL.md** |
| SSRF (webhook, fetch URL, callback) | **skills/ssrf/SKILL.md** |
| File upload (type bypass, path traversal, XSS) | **skills/file-upload/SKILL.md** |
| JWT / session (alg none, weak secret, token in URL) | **skills/jwt-session/SKILL.md** |
| CORS (reflect Origin, credentials) | **skills/cors/SKILL.md** |
| UI-driven flow (login, checkout via browser) | **skills/ui-flow/SKILL.md** |
| Post-login ACL (use cookies/HAR; IDOR, escalation) | **skills/post-login-acl/SKILL.md** |
| Logic flaw (step bypass, tampering, race, replay) | **skills/logic-flaw/SKILL.md** |
| Access control (IDOR, escalation, tampering, logic) — generic | **skills/access-control/SKILL.md** |
| Auth & session — generic | **skills/auth/SKILL.md** |
| Rate limiting & anti-automation (login/register/forgot/otp/reset/auth APIs, or when 401/403 indicate an auth boundary) | **skills/rate-limit/SKILL.md** |
| Other (methods, headers, disclosure, CAPTCHA) | **skills/other/SKILL.md** |

**Skill usage rules**

1. **One skill per focused task** unless a dependency is explicitly needed (e.g. ui-flow to capture HAR, then post-login-acl).
2. After loading a skill, follow its **THINK → ACT → OBSERVE → REFLECT → LOG** flow.
3. For each confirmed vulnerability, call **report_finding** before moving on.
4. Log progress in the Pentest State under:
   - `# Checklist progress`
   - `# Tested vectors`
   - Relevant `Artifacts` and `Findings` subsections.

---

## Stage 1 — Scope (Orchestration)

- Use `skills/PENTEST_WORKFLOW.md` as the reference for Scope rules.
- Steps:
  - Ask the user (or read the latest user message) to determine the **target** and any **scope limitations** (e.g. staging only, no production payments).
  - Initialize or update the Pentest State file at `daily/<target>/<YYYY-MM-DD>`.
  - Set:
    - `Target`
    - `Date`
    - `Scope confirmed: true|false`
    - `Stage.Scope: IN_PROGRESS` → `DONE`
  - Do not use **exec**.
- Log scope confirmation and any constraints in:
  - `# Pentest State` (Scope fields)
  - `# Checklist progress` (e.g. “Scope confirmed: true”).

---

## Stage 2 — Recon (Requirements & Checklist)

Recon follows the rules in `skills/PENTEST_WORKFLOW.md` and must be **non-destructive**.

- **Required recon outputs**
  - Headers summary (`curl -I`).
  - Tech stack notes (Server, X-Powered-By, framework hints).
  - robots/sitemap discovery (`/robots.txt`, `/sitemap.xml`, `/.well-known/`).
  - Dir/path enumeration:
    - `exec: dirsearch` **or**
    - `craft_payload` curl loop fallback.
  - WAF hints based on headers and error responses.
  - Update `Endpoints.discovered` with all known paths/URLs.
- **Tools**
  - **exec**: `curl`, `nmap` (safe usage only), `dirsearch`, `wfuzz` (low-volume).
  - **craft_payload**: small curl loops if tools missing.
- **Logging into Pentest State**
  - `Artifacts.recon`: references to recon logs, outputs.
  - `Endpoints.discovered`: updated list.
  - `# Checklist progress`: which recon items are done or partial.
  - `# Tested vectors`: brief description of recon requests and results.
- **Locking Recon**
  - When recon completion criteria are satisfied:
    - Set `Stage.Recon: DONE` (or `PARTIAL` if limited).
    - Set `Locks.ReconLocked: true`.

---

## Stage 3 — Enumeration (Requirements & Checklist)

Enumeration uses recon outputs to understand and lightly probe parameters and auth surfaces.

- **Required enumeration outputs**
  - Parameter identification (query/body) for key endpoints.
  - Light parameter fuzzing with wfuzz or curl loops to find hidden parameters (respect safety caps).
  - Auth surface mapping:
    - `/login`, `/register`, `/signup`, `/forgot`, `/reset`, `/otp`, `/verify`, `/api/auth`, etc.
  - Optional SPA/auth support:
    - Run `skills/ui-flow/SKILL.md` or `skills/auth-journey/SKILL.md` to capture HAR and cookies if needed.
  - Update:
    - `Endpoints.authenticated_only`
    - `Parameters.discovered`
- **Tools**
  - **exec**: `curl`, `wfuzz` (low volume).
  - **craft_payload**: small loops.
- **Logging into Pentest State**
  - `Artifacts.enumeration`: references to enumeration logs and HARs.
  - `Parameters.discovered`, `Endpoints.authenticated_only` updated.
  - `# Checklist progress`: enumeration coverage.
  - `# Tested vectors`: endpoints and parameters tested, with outcomes.
- **Locking Enumeration**
  - When enumeration completion criteria are satisfied:
    - Set `Stage.Enumeration: DONE` (or `PARTIAL` if limited).
    - Set `Locks.EnumerationLocked: true`.

---

## Stage 4 — Vulnerability Analysis + Verify (Requirements & Checklist)

Verify uses artifacts from Recon and Enumeration to test **specific vulnerability hypotheses**.

- **Candidate building**
  - From `Endpoints.discovered`, `Endpoints.authenticated_only`, and `Parameters.discovered`, construct `Findings.candidates`:
    - Each candidate should specify: endpoint, parameter(s), suspected vuln type(s).
- **Per-candidate workflow**
  - Decide the best-matching skill (SQLi/XSS/IDOR/CSRF/etc.).
  - Load that skill via **memory_get**.
  - Run **minimal PoC checks** within that skill’s safety rules (no brute force, no destructive actions).
  - If confirmed:
    - Call **report_finding(...)** (required).
    - Append the finding ID/title to `Findings.confirmed`.
- **Tools**
  - **exec**: `curl`, `wfuzz`, `sqlmap`, safe node runners, etc., as allowed by individual skills.
  - **craft_payload** for small helpers and replays.
- **Logging into Pentest State**
  - `Artifacts.verify`: references to PoC scripts, logs, HARs.
  - `Findings.candidates`: populated and updated as processed.
  - `Findings.confirmed`: synchronized with actual report_finding calls.
  - `# Checklist progress`: which vulnerability classes were checked.
  - `# Tested vectors`: specific payloads/vectors used and high-level results.
- **Locking Verify**
  - When all known candidates are processed or scope/time is exhausted:
    - Set `Stage.Verify: DONE` (or `PARTIAL`).
    - Set `Locks.VerifyLocked: true`.
  - Do not leave confirmed issues without **report_finding**.

---

## Stage 5 — Report (Requirements & Checklist)

The Report stage compiles the work already done; it does **not** run new tests.

- **Requirements**
  - Ensure every entry in `Findings.confirmed` corresponds to a prior **report_finding** call.
  - Summarize coverage by stage (Scope, Recon, Enumeration, Verify).
  - List remaining gaps or blocked areas:
    - E.g. “CAPTCHA limited further brute-force checks”, “Admin area not in scope”.
  - Mark `Stage.Report: DONE` in the Pentest State.
- **Tools**
  - **memory_get**, **memory_search** only.
  - **write_file** to update the Pentest State and add any final checklist notes.
- **Logging**
  - Update `# Checklist progress` with a concise stage-by-stage summary.
  - Ensure `# Tested vectors` and all Artifacts sections are consistent with the work performed.

---

## Global Rules (applied by the Orchestrator)

1. **In-scope only**
   - Scope is defined by what the user explicitly authorizes for this engagement. If scope is unclear, ask the user before calling **exec**.
2. **Non-destructive**
   - No DoS, no brute force, no data deletion, and no real economic impact.
3. **Proof required**
   - Every confirmed vulnerability must be accompanied by a **report_finding** call with payload and evidence.
4. **Coverage over single bugs**
   - Do not stop after one bug; continue through the stage workflow until coverage is adequate or scope/time is exhausted.
5. **State-driven behavior**
   - Always read and update the canonical Pentest State at `daily/<target>/<YYYY-MM-DD>`:
     - Avoid retesting areas already logged and locked.
     - Use unlock triggers only for targeted re-runs on new surfaces.

