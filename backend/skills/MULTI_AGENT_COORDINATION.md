---
name: multi-agent-coordination
description: "Multi-agent coordination for GwehAI — task mapping, Work Registry, and claim/lock protocol to prevent duplicate recon/enum/verify."
---

# Multi-Agent Coordination for GwehAI

## Purpose

Define how GwehAI uses **multiple agents** (sessions) without duplicating work by:

- Assigning **unique tasks** to explicit roles:
  - `ReconAgent`
  - `EnumAgent`
  - `VerifyAgent-A`, `VerifyAgent-B`, etc.
  - `ReportAgent`
- Maintaining a shared **Work Registry** in the canonical state file at `daily/<target>/<YYYY-MM-DD>`.
- Requiring a **claim/lock protocol** before any agent calls **exec** or **craft_payload**.

This coordination layer is used by the orchestrator (main agent) together with `skills/PENTEST_WORKFLOW.md` and `skills/WEB_CHECKLIST.md`.

---

## Agent Spawn Policy

- **Only the Orchestrator (Main Agent)** may spawn or manage other sessions.
- Only the Orchestrator may call: `sessions_spawn`, `sessions_list`, `sessions_send`, `sessions_history`, `session_status`.
- **Worker agents (ReconAgent, EnumAgent, Verify-ACL/Injection/RequestConfig/BusinessLogic, ReportAgent) MUST NOT** call any of these session tools. If a worker needs help, it must create a **HELP_REQUEST** task in the Work Registry for the Orchestrator to handle (see HELP_REQUEST format below).
- No chain spawning: subagents must never spawn or manage other sessions.

---

## Roles & Responsibilities

### Orchestrator (Main Agent — Agent A)

- **Only agent allowed to spawn subagents** via `sessions_spawn(role/title)`.
- Decides which stages are active based on Pentest State and `PENTEST_WORKFLOW.md`.
- Creates and maintains the Work Registry; assigns TASK_IDs; sends instructions via `sessions_send(session_id, message, wait_for_reply)`.
- Periodically: `sessions_list()`, `sessions_history(session_id)`; merges outputs; **only the Orchestrator** updates `# Checklist progress`, `# Tested vectors`, and stage/locks in `# Pentest State`.
- Ensures one **report_finding** per confirmed vulnerability (FINDING_KEY de-duplication).
- Processes **Help Requests** from workers (see Help Requests below).

### ReconAgent (Agent B)

- Completes **Recon slice ONLY**. Uses **skills/recon/SKILL.md**.
- Tasks: headers/tech/WAF, robots/sitemap, dir/path enumeration, endpoint discovery.
- Must **claim** each task in Work Registry before **exec** or **craft_payload**; writes results to Work Registry → Completed with artifacts + summary.
- Does **not** call sessions_spawn/list/send/history/status. Does **not** update Checklist progress or Tested vectors.

### EnumAgent (Agent C)

- Completes **Enumeration slice ONLY**. Uses **skills/enumeration/SKILL.md** (create if missing).
- Tasks: parameter mapping (query/body), auth surface discovery, light hidden-param fuzzing, API mapping.
- Same claim protocol; writes to Work Registry → Completed only. No session tools; no checklist/Tested vectors update.

### Verify-ACL (Agent D)

- Completes **IDOR / Access Control / Privilege** verification only. Uses **skills/idor/SKILL.md** and access-control patterns.
- Claims VERIFY-ACL/IDOR tasks; runs skill; **report_finding** when confirmed; writes to Work Registry → Completed. No session tools; no checklist/Tested vectors update.

### Verify-Injection (Agent E)

- Completes **Injection** verification: SQLi, XSS, LFI, Command injection, XXE, NoSQL as applicable. Uses **skills/sqli/SKILL.md**, **skills/xss-advanced/SKILL.md**, **skills/lfi/SKILL.md**, **skills/command-injection/SKILL.md**, **skills/xxe/SKILL.md**, **skills/nosql-injection/SKILL.md**.
- Claims VERIFY-Injection tasks per endpoint/param; runs appropriate skill; **report_finding** when confirmed; writes to Completed. No session tools; no checklist/Tested vectors update.

### Verify-RequestConfig (Agent F)

- Completes **Request/Config** verification: CSRF, SSRF, CORS, Open Redirect, Rate limit, security headers. Uses **skills/csrf/SKILL.md**, **skills/ssrf/SKILL.md**, **skills/cors/SKILL.md**, **skills/open-redirect/SKILL.md**, **skills/rate-limit/SKILL.md**, plus header snapshot usage.
- Claims VERIFY-RequestConfig tasks; runs skills; **report_finding** when confirmed; writes to Completed. No session tools; no checklist/Tested vectors update.

### Verify-BusinessLogic (Agent G)

- Completes **Business Logic** verification only. Uses **skills/logic-flaw/SKILL.md**: multi-step bypass, price/coupon tampering, replay/idempotency, state machine violations, micro race checks (safe, e.g. 2 concurrent requests for PoC).
- Claims VERIFY-BusinessLogic tasks; runs logic-flaw skill; **report_finding** when confirmed; writes to Completed. No session tools; no checklist/Tested vectors update.

### ReportAgent (Agent H — optional)

- **Single-owner** for Report stage: compiles final report from Work Registry and Pentest State; confirms all Findings.confirmed have report_finding; no **exec** or new tests.
- May be a dedicated session or the Orchestrator acting as report owner.

---

## Worker Instructions Template (Subagent System Message)

When the Orchestrator spawns a worker (B/C/D/E/F/G or H), the worker’s instructions MUST include:

- **You are a worker agent. You MUST NOT call sessions_spawn, sessions_list, sessions_send, sessions_history, or session_status. If you need help, create a HELP_REQUEST task in the Work Registry (see MULTI_AGENT_COORDINATION.md) for the Orchestrator.**
- **Before any exec(...) or craft_payload(...), you MUST claim the corresponding task in the Work Registry (daily/<target>/<YYYY-MM-DD>). If the task is already IN_PROGRESS or DONE, skip it.**
- **Write your results only to the Work Registry: update Task Queue status, Claims, and Completed with result_summary and artifact_refs. Do not update # Checklist progress or # Tested vectors; the Orchestrator will merge and update those.**
- Role-specific: target, stage, assigned TASK_IDs, safety caps, and which skill file(s) to use.

---

## Work Registry Schema

The Work Registry lives in the same canonical state file as the Pentest State:

- Path: `daily/<target>/<YYYY-MM-DD>`

It adds the following section:

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

### Task ID Format

Each task has a unique `TASK_ID`:

- Format: `<STAGE>-<CATEGORY>-<ENDPOINT_OR_AREA>-<HASH_OR_COUNTER>`
- Examples:
  - `RECON-HEADERS-root-01`
  - `RECON-DIRSEARCH-root-01`
  - `ENUM-PARAMS-/api/search-01`
  - `ENUM-AUTHSURFACE-/login-01`
  - `VERIFY-SQLI-/api/search?q-01`
  - `VERIFY-IDOR-/api/orders?id-01`

### Task Fields

- `TASK_ID`: unique identifier.
- `type`: high-level type, e.g. `RECON-HEADERS`, `ENUM-PARAMS`, `VERIFY-SQLI`.
- `scope`: description of the area (endpoint, host, param set).
- `owner`: assigned `session_id` or `null` if unassigned.
- `status`: `TODO` | `IN_PROGRESS` | `DONE` | `FAILED` | `BLOCKED`.
- `created_at`: timestamp string.

**Task key (uniqueness):** `(Stage, Category, NormalizedEndpoint, ParamNames)`. Use normalized URL (lowercase host, strip fragment, sort query params, remove tracking params e.g. utm_*, fbclid, gclid). If same key exists with status `IN_PROGRESS` or `DONE`, do not rerun.

### Claims (Locks)

- `TASK_ID: owner_session_id | lock_until | notes`
  - `owner_session_id`: `session_id` returned by `sessions_spawn(...)`.
  - `lock_until`: timestamp in the future; default 15 minutes from claim. Worker may renew by updating lock_until to a new future time while status is IN_PROGRESS.
  - `notes`: brief description (e.g. “ReconAgent doing dirsearch on /”).

### Completed

- `TASK_ID | owner | result_summary | artifact_refs`
  - `owner`: `session_id`.
  - `result_summary`: short human-readable string.
  - `artifact_refs`: file paths, HAR names, or other references written via **write_file**.

### Help Requests

- Workers must **not** call sessions_spawn/list/send/history/status. If a worker needs help, it adds an entry to **Help Requests**.
- **HELP_REQUEST format**: `HELP_REQUEST-<id>: from_session=<session_id> | task_ref=<TASK_ID or scope> | reason=<short description> | status=OPEN`
- Orchestrator periodically reads Help Requests; resolves (e.g. by assigning different task, clarifying scope, or sending guidance via sessions_send); then sets `status=RESOLVED` and notes resolution.
- Example: `HELP_REQUEST-01: from_session=xyz | task_ref=VERIFY-SQLI-/api/search?q-01 | reason=WAF blocking all probes | status=OPEN`

---

## FINDING_KEY Uniqueness Rule (Avoid Duplicate report_finding)

Before calling **report_finding** for a confirmed vulnerability:

1. Compute **FINDING_KEY** = `<category>|<normalized_endpoint>|<param>|<impact>` (e.g. `SQLI|https://target.com/api/search|q|dump_db_name`).
2. Check if this FINDING_KEY (or equivalent title/ID) already exists in `Findings.confirmed` or the Work Registry Completed notes.
3. If it **exists**: do **not** call report_finding again; add a note in Work Registry that this agent saw a duplicate.
4. If it **does not exist**: call **report_finding(..., finding_key: FINDING_KEY)** so the backend can dedup by key (one finding per key per conversation). Add the FINDING_KEY to `Findings.confirmed`.

**Backend dedup:** report_finding is deduplicated by (conversationId, detail, target, poc) and by optional **finding_key** — when finding_key is provided, the system returns the existing finding if that key already exists for the conversation.

---

## Claim Protocol (Exec / craft_payload Guard)

Before **any agent** runs `exec(...)` or `craft_payload(...)`, it must follow the **claim protocol**.

### Steps

1. **Read Work Registry**
   - Use **memory_get(path: "daily/<target>/<YYYY-MM-DD>")**.
   - Parse the `# Work Registry` section.

2. **Check for existing matching TASK_ID**
   - Use the de-duplication matching rules below.
   - If a matching TASK_ID exists and its **status** is `IN_PROGRESS` or `DONE`:
     - **Do not** run the work.
     - Optionally log in `notes` that work is already in progress or completed.

3. **If no TASK_ID exists**
   - Construct a new `TASK_ID` following the format.
   - Append it to `Task Queue` with:
     - `status = TODO`
     - `owner = null`

4. **Claim the Task**
   - Create or update a `Claims` entry:
     - `TASK_ID: <agent_session_id> | lock_until=<now+15min> | notes=<short reason>`
   - Update the corresponding task line in `Task Queue`:
     - Set `status = IN_PROGRESS`
     - Set `owner = <agent_session_id>`
   - Persist back using **write_file** (overwrite the canonical file with updated sections).

5. **Run Work**
   - Now the agent is allowed to call **exec** or **craft_payload** for this TASK_ID, respecting:
     - Scope rules (`SCOPE.md`).
     - Stage and skill safety limits.

6. **Write Results**
   - After work finishes:
     - Update `Task Queue` entry:
       - `status = DONE` (or `FAILED` / `BLOCKED` with description).
     - Append entry to `Completed`:
       - `TASK_ID | owner=<agent_session_id> | result_summary | artifact_refs`
   - If relevant, update Pentest State sections:
     - `Artifacts`, `Endpoints`, `Parameters`, `Findings.candidates`, `Findings.confirmed`.

7. **Lock Expiry & Reclaims**
   - If `lock_until` expires and `status` is **not** `DONE`:
     - Another agent may attempt to reclaim the task by:
       - Updating `Claims[TASK_ID]` with a new `owner_session_id` and future `lock_until`.
       - Setting `owner` to the new session in `Task Queue`.
   - Agents **must not** reclaim a task that is already `DONE` unless the user explicitly requests a redo.

---

## De-duplication & Normalization Rules

### De-duplication Matching

A task is considered a **duplicate** if it has the same:

- **Stage** + **category** + **endpoint/param** (normalized).

Examples:

- `VERIFY-SQLI` on the **same URL + param** is a duplicate.
- `VERIFY-IDOR` on the **same endpoint + id-like param** is a duplicate.
- `RECON-DIRSEARCH` on the **same root path** is a duplicate.

Agents must treat such tasks as the **same** and avoid re-running them once `IN_PROGRESS` or `DONE`.

### URL Normalization

When constructing or matching TASK_IDs:

- Lowercase the **host**.
- Strip URL **fragments** (`#...`).
- Sort query parameters by **key**.
- Normalize equivalent slashes (`//` → `/`).

### Parameter Normalization

- Same **param key** on the same normalized endpoint and same **vulnerability category** means same test.
  - Example:
    - `VERIFY-SQLI-/api/search?q-01` and `VERIFY-SQLI-/api/search?q-02` target the same logical test.
  - Use one TASK_ID per **(endpoint, param, category)** combination.

---

## Role Assignment & Default Multi-Agent Mapping

When the user asks for multiple agents (e.g. “work with 3 agents”), the orchestrator should:

### Slice-based mapping (B/C/D/E/F/G/H)

- **Agent B — ReconAgent**: Recon slice only → **skills/recon/SKILL.md**
- **Agent C — EnumAgent**: Enumeration slice only → **skills/enumeration/SKILL.md**
- **Agent D — Verify-ACL**: IDOR/Access Control/Privilege → **skills/idor/SKILL.md** + access-control patterns
- **Agent E — Verify-Injection**: SQLi/XSS/LFI/Command/XXE/NoSQL → **skills/sqli**, **skills/xss-advanced**, **skills/lfi**, **skills/command-injection**, **skills/xxe**, **skills/nosql-injection**
- **Agent F — Verify-RequestConfig**: CSRF/SSRF/CORS/Open Redirect/Rate limit/headers → **skills/csrf**, **skills/ssrf**, **skills/cors**, **skills/open-redirect**, **skills/rate-limit**
- **Agent G — Verify-BusinessLogic**: Business logic flaws → **skills/logic-flaw/SKILL.md**
- **Agent H — ReportAgent** (optional): Final report only; single-owner.

Task Queue is built by stage + category + endpoint/param; assign tasks deterministically (e.g. hash-based sharding) to avoid overlap. See **WEB_CHECKLIST.md** for Multi-agent Router and Skill Router.

---

## Messaging Format to Sub-Agents

The orchestrator must send structured instructions to sub-agents using `sessions_send(session_id, message, wait_for_reply)`.

Each message to a sub-agent should include at least:

- **Target**: e.g. `https://example.com`
- **Stage**: `SCOPE`, `RECON`, `ENUMERATION`, `VERIFY`, or `REPORT`
- **Assigned TASK_IDs**: list or subset of Task Queue IDs for that agent.
- **Safety caps**:
  - E.g. max requests per endpoint, rate limits from skills.
- **Required outputs**:
  - What to write into `# Work Registry → Completed`.
  - What to update in `# Pentest State` (Artifacts, Endpoints, Parameters, Findings).
- **Claim requirement**:
  - Explicit reminder: **“Do not run anything unless you successfully claim the task in the Work Registry.”**

Example message body (conceptual):

```text
Role: ReconAgent
Target: https://example.com
Stage: RECON
Assigned TASK_IDs:
  - RECON-HEADERS-root-01
  - RECON-ROBOTS-root-01
Safety:
  - Respect SCOPE.md
  - Low-volume only; no brute force
Required outputs:
  - Headers summary, robots/sitemap notes
  - Update Endpoints.discovered and Artifacts.recon
Claim protocol:
  - Before any exec or craft_payload, claim your TASK_ID in # Work Registry.
```

Sub-agents must respond with:

- Status per TASK_ID (`DONE`, `FAILED`, `BLOCKED`).
- Paths to any artifacts (files/logs) they wrote.
- Any confirmed findings (ensuring **report_finding** was called).

---

## Merging Results & Avoiding Duplicate Exploits

### Orchestrator Merge Loop

The orchestrator should periodically:

1. Call `sessions_list()` to see active sessions.
2. For each sub-agent session:
   - Call `sessions_history(session_id)` to read new messages/results.
3. For each completed task:
   - Update `# Work Registry → Completed`.
   - Update `# Pentest State`:
     - Merge new Artifacts, Endpoints, Parameters, Findings.
     - Update `# Checklist progress` and `# Tested vectors` so they reflect what the **whole team** has already covered (per TASK_ID).
4. For each confirmed vulnerability:
   - Ensure a **single** `FINDING_KEY` entry exists in the Confirmed set (see below).

### Finding De-duplication

Define a `FINDING_KEY`:

- `FINDING_KEY = <category>|<endpoint>|<param>|<impact>`
  - `category`: e.g. `SQLI`, `XSS`, `IDOR`, `CSRF`, `LOGIC`, `LFI`, `SSRF`.
  - `endpoint`: normalized URL + method where relevant.
  - `param`: parameter name or `none`.
  - `impact`: short string (e.g. `dump_db_name`, `steal_session`, `read_other_user_data`).

The orchestrator (or VerifyAgents following this rule) must:

- Before calling **report_finding** for a confirmed issue:
  - Check if a matching `FINDING_KEY` already exists in:
    - `Findings.confirmed` or a dedicated Confirmed registry.
  - If it exists:
    - Do **not** call `report_finding` again.
    - Instead, add a note in the Work Registry that this agent saw a duplicate of the same issue.
  - If it does not exist:
    - Call **report_finding(...)**.
    - Add the `FINDING_KEY` (or corresponding title/ID) to `Findings.confirmed`.

This ensures no two agents report the **same vulnerability** twice, even if they both encounter similar evidence.

---

## Parallel Mode & Coordination with Pentest Workflow

`skills/PENTEST_WORKFLOW.md` defines which stages can run in parallel and how. In parallel mode:

- Recon tasks may be split (headers/tech, dir enumeration, WAF hints).
- Enumeration tasks may be split (params mapping, auth surface, API mapping).
- Verify tasks may be split by vulnerability class.

The orchestrator must still:

- Respect **stage locks** (from Pentest Workflow).
- Use the **Work Registry** to avoid duplicate recon/enum/verify tasks.
- Ensure that **Report** is handled by a **single owner** (ReportAgent) with no parallel testing.

