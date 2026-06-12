---
name: web-checklist
description: "Stage-driven web pentest orchestrator — stage router, checklist items, gate rules, and integration with PentestState + Work Registry. The primary entry point for all pentest flows."
---

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

## PentestState + Work Registry Integration

This checklist is tightly coupled with two data structures stored in the canonical state file at `daily/<target>/<YYYY-MM-DD>`:

### PentestState (Source of Truth)

The PentestState object tracks all engagement data. This checklist **reads and writes** these fields:

```text
PentestState:
  target: string
  scope:
    allowed_hosts: [string]
    allowed_urls: [string]
    notes: string
  phase: "recon" | "exploit" | "report" | "completed"
  phase_lock:
    recon_complete: boolean
    exploit_complete: boolean
    report_complete: boolean
  checklist:
    recon: boolean
    input_handling: boolean
    auth_session: boolean
    access_control: boolean
    business_logic: boolean
    other: boolean
  artifacts:
    endpoints: [string]
    forms: [{url, method, params:[string]}]
    parameters: [string]
    tech_stack: {server, framework, waf_hints, headers: {}}
  tested_vectors: [string]
  findings_index: [string]
  last_action_summary: string
```

### Work Registry (Multi-Agent Coordination)

When running in multi-agent mode, the Work Registry section tracks parallel work:

```text
# Work Registry
- Active Agents:
  - <session_id>: <role> | status
- Task Queue:
  - [ ] TASK_ID | type | scope | owner | status | created_at
- Claims (Locks):
  - TASK_ID: owner_session_id | lock_until | notes
- Completed:
  - TASK_ID | owner | result_summary | artifact_refs
- Help Requests:
  - HELP_REQUEST-<id>: from_session | task_ref | reason | status (OPEN|RESOLVED)
```

### Stage ↔ PentestState Field Mapping

| Stage | Writes to PentestState fields |
|-------|-------------------------------|
| SCOPE | `target`, `scope.*`, `phase`, `checklist.recon=false` |
| RECON | `artifacts.endpoints`, `artifacts.tech_stack`, `artifacts.forms`, `phase_lock.recon_complete`, `phase="exploit"` |
| ENUMERATION | `artifacts.parameters`, `artifacts.forms` (detailed), `tested_vectors` |
| VERIFY | `tested_vectors`, `findings_index`, `checklist.{input_handling,auth_session,access_control,business_logic,other}`, `phase_lock.exploit_complete`, `phase="report"` |
| REPORT | `phase_lock.report_complete`, `phase="completed"`, `last_action_summary` |

### 5-Stage ↔ 3-Phase Mapping (CORE_ORCHESTRATOR alignment)

The CORE_ORCHESTRATOR uses a 3-phase model (`recon` → `exploit` → `report`). This 5-stage checklist maps to it:

| 5-Stage (this file) | 3-Phase (CORE_ORCHESTRATOR) | PentestState.phase |
|----------------------|-----------------------------|--------------------|
| SCOPE | (pre-recon) | `recon` (with checklist.recon=false) |
| RECON | `recon` | `recon` |
| ENUMERATION | `exploit` (early) | `exploit` |
| VERIFY | `exploit` (main) | `exploit` |
| REPORT | `report` | `report` → `completed` |

**Gate rule:** Phase transitions follow CORE_ORCHESTRATOR rules — `recon` phase requires `checklist.recon=true` to advance; `exploit` phase requires all checklist sections true; `report` phase sets `completed`.

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

- Once a stage is marked **DONE** and its lock flag set to `true`, the orchestrator must **not** rerun that stage's heavy actions.
- Earlier stages may only be **temporarily unlocked** and re-run in a **targeted** fashion when an allowed unlock trigger occurs (see below).

---

## Gate Rules (Stage Transition Conditions)

A stage can only transition to the next when its **gate conditions** are satisfied:

### Gate 1: SCOPE → RECON
- [ ] User has stated target(s) clearly
- [ ] Scope limitations documented (staging only? no payments? etc.)
- [ ] `Scope confirmed: true` in Pentest State
- [ ] `Stage.Scope: DONE`

### Gate 2: RECON → ENUMERATION
- [ ] Headers summary captured (`curl -I`)
- [ ] Tech stack inferred (server, framework, language, DB hints)
- [ ] robots.txt / sitemap.xml / .well-known checked
- [ ] Directory/path enumeration done (dirsearch or curl loop)
- [ ] WAF hints documented
- [ ] `Endpoints.discovered` populated
- [ ] `Stage.Recon: DONE` (or `PARTIAL`)
- [ ] `Locks.ReconLocked: true`

### Gate 3: ENUMERATION → VERIFY
- [ ] Parameters identified for key endpoints (query/body)
- [ ] Light parameter fuzzing attempted (wfuzz or curl loops)
- [ ] Auth surfaces mapped (/login, /register, /forgot, /otp, /api/auth, etc.)
- [ ] `Parameters.discovered` populated
- [ ] `Endpoints.authenticated_only` populated (if auth exists)
- [ ] `Stage.Enumeration: DONE` (or `PARTIAL`)
- [ ] `Locks.EnumerationLocked: true`

### Gate 4: VERIFY → REPORT
- [ ] All `Findings.candidates` processed (confirmed, rejected, or blocked)
- [ ] Every confirmed finding has `report_finding` called with evidence
- [ ] `Findings.confirmed` synchronized with report_finding outputs
- [ ] All CORE_ORCHESTRATOR checklist sections completed (see Verify sub-checklist below)
- [ ] `Stage.Verify: DONE` (or `PARTIAL`)
- [ ] `Locks.VerifyLocked: true`

### Gate 5: REPORT → DONE
- [ ] All confirmed findings cross-checked against report_finding calls
- [ ] Coverage summary written (per-stage status)
- [ ] Gaps and blocked areas documented
- [ ] `Stage.Report: DONE`
- [ ] `phase = "completed"`

---

## Checklist Items (Per Stage)

### Stage 1 — SCOPE Checklist

- [ ] **1.1** Identify target URL(s) / domain(s)
- [ ] **1.2** Confirm scope limitations with user (staging? production? specific paths?)
- [ ] **1.3** Record `allowed_hosts` and `allowed_urls` in PentestState
- [ ] **1.4** Set `Scope confirmed: true|false`
- [ ] **1.5** Initialize canonical state file at `daily/<target>/<YYYY-MM-DD>`
- [ ] **1.6** Set `Stage.Scope: DONE`

**DO NOT:** call exec, send HTTP requests, run any tools.

---

### Stage 2 — RECON Checklist

- [ ] **2.1 Headers & Security Posture**
  - [ ] `curl -I <target>` — capture status code, Server, X-Powered-By
  - [ ] Check security headers: Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, Referrer-Policy
  - [ ] Document missing/insecure headers
- [ ] **2.2 Tech Stack Inference**
  - [ ] Infer server type (nginx, Apache, etc.)
  - [ ] Infer framework/language (Express, Django, Laravel, etc.)
  - [ ] Infer database hints (from error pages, headers)
  - [ ] Record in `artifacts.tech_stack`
- [ ] **2.3 robots.txt / Sitemap / Well-Known**
  - [ ] Fetch `/robots.txt` — extract disallowed paths
  - [ ] Fetch `/sitemap.xml` — extract listed URLs
  - [ ] Check `/.well-known/` for security.txt, openid-configuration, etc.
- [ ] **2.4 Directory/Path Enumeration**
  - [ ] Run `dirsearch` (or `wfuzz` with safe wordlist)
  - [ ] Fallback: `craft_payload` curl loop with common paths
  - [ ] Record discovered paths in `Endpoints.discovered`
- [ ] **2.5 WAF Detection**
  - [ ] Check for WAF indicators in headers (e.g. `cf-ray`, `x-sucuri-id`, `x-akamai`)
  - [ ] Send test payload to check WAF response patterns
  - [ ] Document WAF type and behavior
- [ ] **2.6 Update Pentest State**
  - [ ] `Artifacts.recon` populated with log references
  - [ ] `Endpoints.discovered` updated
  - [ ] `Stage.Recon: DONE` (or `PARTIAL`)
  - [ ] `Locks.ReconLocked: true`

---

### Stage 3 — ENUMERATION Checklist

- [ ] **3.1 Parameter Mapping**
  - [ ] For each key endpoint in `Endpoints.discovered`, identify query parameters
  - [ ] Identify body parameters (POST/PUT endpoints)
  - [ ] Identify header-based inputs (custom headers, cookies)
  - [ ] Record in `Parameters.discovered`
- [ ] **3.2 Hidden Parameter Discovery**
  - [ ] Run `wfuzz` or curl loops with common param names
  - [ ] Test for parameter pollution / type confusion
  - [ ] Record newly found parameters
- [ ] **3.3 Auth Surface Mapping**
  - [ ] Identify `/login`, `/register`, `/signup`, `/forgot`, `/reset`
  - [ ] Identify `/otp`, `/verify`, `/2fa`, `/mfa`
  - [ ] Identify `/api/auth`, `/api/token`, `/api/session`
  - [ ] Map auth flow (which endpoints call which)
  - [ ] Record in `Endpoints.authenticated_only`
- [ ] **3.4 SPA/Auth Flow Capture (if needed)**
  - [ ] Load `skills/ui-flow/SKILL.md` for SPA crawling
  - [ ] Load `skills/auth-journey/SKILL.md` for auth flow HAR capture
  - [ ] Capture HAR and cookies.json for later verification
- [ ] **3.5 Update Pentest State**
  - [ ] `Artifacts.enumeration` populated
  - [ ] `Parameters.discovered` updated
  - [ ] `Endpoints.authenticated_only` updated
  - [ ] `Stage.Enumeration: DONE` (or `PARTIAL`)
  - [ ] `Locks.EnumerationLocked: true`

---

### Stage 4 — VERIFY Checklist (maps to CORE_ORCHESTRATOR exploit phase)

The Verify stage maps to the CORE_ORCHESTRATOR's `exploit` phase. Each sub-section below corresponds to a `checklist.*` field in PentestState:

#### 4A. Input Handling (`checklist.input_handling`)
- [ ] **4A.1** SQL Injection — test all query/body params with `skills/sqli/SKILL.md`
- [ ] **4A.2** XSS (Reflected/Stored) — test with `skills/xss/SKILL.md` or `skills/xss-advanced/SKILL.md`
- [ ] **4A.3** LFI / Path Traversal — test file params with `skills/lfi/SKILL.md`
- [ ] **4A.4** Command Injection — test with `skills/command-injection/SKILL.md`
- [ ] **4A.5** XXE — test XML endpoints with `skills/xxe/SKILL.md`
- [ ] **4A.6** NoSQL Injection — test with `skills/nosql-injection/SKILL.md`
- [ ] **4A.7** Header Injection — test with `skills/header-injection/SKILL.md`
- [ ] **4A.8** Open Redirect — test redirect params with `skills/open-redirect/SKILL.md`
- [ ] **4A.9** File Upload — test upload endpoints with `skills/file-upload/SKILL.md`
- [ ] **4A.10** Mark `checklist.input_handling = true` when all candidates processed

#### 4B. Auth & Session (`checklist.auth_session`)
- [ ] **4B.1** Auth bypass — test with `skills/auth/SKILL.md`
- [ ] **4B.2** JWT/Token issues — test with `skills/jwt-session/SKILL.md`
- [ ] **4B.3** Session fixation / hijacking
- [ ] **4B.4** Password reset flow abuse
- [ ] **4B.5** OTP/2FA bypass
- [ ] **4B.6** Mark `checklist.auth_session = true` when all candidates processed

#### 4C. Access Control (`checklist.access_control`)
- [ ] **4C.1** IDOR — test with `skills/idor/SKILL.md`
- [ ] **4C.2** Privilege escalation (horizontal/vertical)
- [ ] **4C.3** Post-login ACL — test with `skills/post-login-acl/SKILL.md`
- [ ] **4C.4** Generic access control — test with `skills/access-control/SKILL.md`
- [ ] **4C.5** Mark `checklist.access_control = true` when all candidates processed

#### 4D. Request/Config (`checklist.other` — RequestConfig slice)
- [ ] **4D.1** CSRF — test with `skills/csrf/SKILL.md`
- [ ] **4D.2** SSRF — test with `skills/ssrf/SKILL.md`
- [ ] **4D.3** CORS misconfiguration — test with `skills/cors/SKILL.md`
- [ ] **4D.4** Rate limiting — test with `skills/rate-limit/SKILL.md`
- [ ] **4D.5** Security headers analysis (detailed, from recon data)
- [ ] **4D.6** Mark `checklist.other = true` when all candidates processed

#### 4E. Business Logic (`checklist.business_logic`)
- [ ] **4E.1** Multi-step flow bypass — test with `skills/logic-flaw/SKILL.md`
- [ ] **4E.2** Price/coupon tampering
- [ ] **4E.3** Replay/idempotency issues
- [ ] **4E.4** State machine violations
- [ ] **4E.5** Race conditions (safe micro-checks, e.g. 2 concurrent requests)
- [ ] **4E.6** Mark `checklist.business_logic = true` when all candidates processed

#### 4F. Verify Completion
- [ ] **4F.1** All `Findings.candidates` processed
- [ ] **4F.2** Every confirmed finding has `report_finding` with confidence + evidence
- [ ] **4F.3** `Findings.confirmed` synchronized
- [ ] **4F.4** `Stage.Verify: DONE` (or `PARTIAL`)
- [ ] **4F.5** `Locks.VerifyLocked: true`
- [ ] **4F.6** `phase_lock.exploit_complete = true`
- [ ] **4F.7** `phase = "report"`

---

### Stage 5 — REPORT Checklist

- [ ] **5.1** Cross-check: every `Findings.confirmed` entry has a `report_finding` call
- [ ] **5.2** Summarize coverage per stage:
  - [ ] Scope: DONE / OUT_OF_SCOPE
  - [ ] Recon: DONE / PARTIAL
  - [ ] Enumeration: DONE / PARTIAL
  - [ ] Verify: DONE / PARTIAL (which checklist sections completed?)
- [ ] **5.3** List remaining gaps:
  - [ ] Unreachable endpoints (auth required, scope limited)
  - [ ] Blocked tests (CAPTCHA, WAF, rate limit)
  - [ ] Untested categories (why? time? scope?)
- [ ] **5.4** For multi-agent mode: ensure all Work Registry tasks are DONE/FAILED/BLOCKED
- [ ] **5.5** Mark `Stage.Report: DONE`
- [ ] **5.6** Set `phase = "completed"`
- [ ] **5.7** Update `last_action_summary` with final status

**DO NOT:** call exec, run new tests, or modify `Findings.confirmed` (except to sync IDs).

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
2. Temporarily set that stage's status to `IN_PROGRESS` and its lock flag to `false`.
3. Perform **targeted work** only for the new host/surface/params.
4. Merge new artifacts into the existing Pentest State:
   - Append to `Artifacts`, `Endpoints`, `Parameters`, and/or `Findings.candidates`.
5. Re-lock the stage:
   - Set status back to `DONE` or `PARTIAL` and the corresponding lock flag to `true`.
6. Document the trigger and targeted work in `# Checklist progress` and `# Tested vectors`.

Do not reset a stage completely or re-run all heavy scanning for areas that are already covered unless the **user explicitly requests** a full redo.

---

## Multi-Agent Router (Task Mapping & Coordination)

When the user explicitly requests **multiple agents** (e.g. "work with 3 agents") or when the workload is **large** (many endpoints/parameters/candidates), the orchestrator should:

1. Ensure the canonical state file at `daily/<target>/<YYYY-MM-DD>` includes:
   - `# Pentest State` (with Stage and Locks).
   - `# Work Registry` (Active Agents, Task Queue, Claims, Completed, Help Requests).
2. Confirm which **stage** is current via the Stage Router (Scope → Recon → Enumeration → Verify → Report).
3. Only Orchestrator may use `sessions_spawn`. Spawn by slice: **B** ReconAgent, **C** EnumAgent, **D** Verify-ACL, **E** Verify-Injection, **F** Verify-RequestConfig, **G** Verify-BusinessLogic, **H** ReportAgent (optional).
4. Build **Task Queue** by stage + category + endpoint/param (normalized URL). Verify slices: ACL, Injection, RequestConfig, BusinessLogic. Assign tasks deterministically (e.g. hash-based sharding) to avoid overlap.
5. Send each sub-agent a **structured message** (via `sessions_send`) that includes:
   - Target, current Stage.
   - Assigned TASK_IDs.
   - Safety caps for that stage and skills.
   - Required outputs (what to write into Work Registry and Pentest State).
   - Explicit instruction: **"Do not run anything unless you successfully claim the task in the Work Registry."**

Each sub-agent (worker) must NOT call sessions_spawn/list/send/history/status; must claim before exec/craft_payload; write only to Work Registry. If help needed, create HELP_REQUEST. Sub-agent must:

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

After the Stage Router chooses the **current stage**, use the **Skill Router** to load only the most relevant skill. Within **Verify**, route by slice:

- **ACL** (Verify-ACL) → **skills/idor/SKILL.md**, access-control patterns.
- **Injection** (Verify-Injection) → **skills/sqli/SKILL.md**, **skills/xss-advanced/SKILL.md**, **skills/lfi/SKILL.md**, **skills/command-injection/SKILL.md**, **skills/xxe/SKILL.md**, **skills/nosql-injection/SKILL.md**.
- **RequestConfig** (Verify-RequestConfig) → **skills/csrf/SKILL.md**, **skills/ssrf/SKILL.md**, **skills/cors/SKILL.md**, **skills/open-redirect/SKILL.md**, **skills/rate-limit/SKILL.md** (+ header snapshot).
- **BusinessLogic** (Verify-BusinessLogic) → **skills/logic-flaw/SKILL.md**.

Load skills via **memory_get(path: "skills/<path>")**. Do not load multiple skills for one sub-step unless explicitly needed (e.g. post-login-acl after ui-flow for cookies).

| Trigger / Checklist step | Load this skill only |
|--------------------------|----------------------|
| Recon, map site, enumerate paths, headers, tech | **skills/recon/SKILL.md** |
| Enumeration (params, auth surface, API map) | **skills/enumeration/SKILL.md** |
| Verify a potential finding (generic) | **skills/verify/SKILL.md** |
| SQL injection | **skills/sqli/SKILL.md** |
| XSS (reflected or stored) | **skills/xss/SKILL.md** |
| XSS advanced (DOM, context, mutation) | **skills/xss-advanced/SKILL.md** |
| LFI / path traversal | **skills/lfi/SKILL.md** |
| Command injection | **skills/command-injection/SKILL.md** |
| Open redirect | **skills/open-redirect/SKILL.md** |
| HTTP header injection | **skills/header-injection/SKILL.md** |
| XXE (XML endpoints) | **skills/xxe/SKILL.md** |
| NoSQL injection | **skills/nosql-injection/SKILL.md** |
| IDOR / ACL | **skills/idor/SKILL.md** |
| Authentication journey | **skills/auth-journey/SKILL.md** |
| CSRF | **skills/csrf/SKILL.md** |
| SSRF | **skills/ssrf/SKILL.md** |
| File upload | **skills/file-upload/SKILL.md** |
| JWT / session | **skills/jwt-session/SKILL.md** |
| CORS | **skills/cors/SKILL.md** |
| UI-driven flow | **skills/ui-flow/SKILL.md** |
| Post-login ACL | **skills/post-login-acl/SKILL.md** |
| Logic flaw / Business logic | **skills/logic-flaw/SKILL.md** |
| Access control (generic) | **skills/access-control/SKILL.md** |
| Auth & session (generic) | **skills/auth/SKILL.md** |
| Rate limiting | **skills/rate-limit/SKILL.md** |
| Other | **skills/other/SKILL.md** |

**Skill usage rules**

1. **One skill per focused task** unless a dependency is explicitly needed (e.g. ui-flow to capture HAR, then post-login-acl).
2. After loading a skill, follow its **THINK → ACT → OBSERVE → REFLECT → LOG** flow.
3. For each confirmed vulnerability, call **report_finding** before moving on (respect FINDING_KEY uniqueness).
4. **No exec or craft_payload** unless the task is **claimed** in the Work Registry. **Workers** do not spawn or manage sessions.
5. Log progress to **daily/<target>/<YYYY-MM-DD>**: only **Orchestrator** updates `# Checklist progress` and `# Tested vectors`; workers write to Work Registry → Completed only.

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
6. **Confidence required**
   - Every `report_finding` call must include `confidence` (0-100) and `confidence_reason` (min 20 chars).
   - Confidence < 50 + weak POC = do NOT report.
   - Confidence < 30 = reject (likely hallucination).

---

## Dedup Integration

Before calling `report_finding` or re-testing a vector:

1. Check `findings_index` in PentestState — if a matching `FINDING_KEY` exists, skip.
2. Check `tested_vectors` — if `(endpoint, param, vuln_type)` is already listed, skip.
3. In multi-agent mode, check `Work Registry → Completed` for duplicate task keys.
4. FINDING_KEY format: `<CATEGORY>|<normalized_endpoint>|<param>|<impact>`

This ensures no duplicate testing or reporting across single-agent and multi-agent modes.
