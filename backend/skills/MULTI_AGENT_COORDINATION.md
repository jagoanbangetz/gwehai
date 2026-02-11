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

## Roles & Responsibilities

### Orchestrator (Main Agent)

- Decides **which stages** are active based on the Pentest State and `PENTEST_WORKFLOW.md`.
- Creates and maintains the **Work Registry** for the target/day.
- Spawns sub-agents when needed using:
  - `sessions_spawn(role/title)`
  - Tracks them under `# Work Registry → Active Agents`.
- Assigns **TASK_IDs** and sends instructions to each sub-agent via:
  - `sessions_send(session_id, message, wait_for_reply)`
- Periodically:
  - Reads `sessions_history(session_id)` and `sessions_list()`.
  - Merges sub-agent outputs back into the Work Registry and Pentest State.
  - **Is the only agent allowed to update**:
    - `# Checklist progress`
    - `# Tested vectors`
    - Stage statuses and locks in `# Pentest State`.
  - Ensures `report_finding(...)` has been called once per confirmed vulnerability.

### ReconAgent

- Handles **Recon stage tasks**:
  - Headers/tech/WAF checks.
  - robots/sitemap.
  - Dir/path enumeration and light fuzzing.
- Before running **exec** or **craft_payload**, always:
  - Reads the **Work Registry**.
  - Claims each recon task using the **claim protocol**.
  - Writes results and updates task status in the registry.
- **Does not** update `# Checklist progress` or `# Tested vectors` directly — only the Main Agent does that when merging results.

### EnumAgent

- Handles **Enumeration stage tasks**:
  - Parameter mapping (query/body).
  - Auth surface discovery (`/login`, `/register`, `/forgot`, `/otp`, etc.).
  - API mapping (e.g. from HAR or OpenAPI-like endpoints).
- Uses the same **claim protocol** to ensure enumeration tasks are not duplicated.
- **Does not** update `# Checklist progress` or `# Tested vectors` directly.

### VerifyAgents (VerifyAgent-A, VerifyAgent-B, Verify-SQLi, Verify-XSS, etc.)

- Handle **Verify stage tasks**:
  - Each VerifyAgent is responsible for one or more vulnerability classes:
    - SQLi, XSS, IDOR/ACL, CSRF, Logic flaws, SSRF, File upload, Rate limiting, etc.
- For each `Findings.candidates` item assigned:
  - Claim the corresponding VERIFY task in the Work Registry.
  - Load and run the right skill (e.g. `skills/sqli/SKILL.md`).
  - If confirmed, call **report_finding(...)** and update `Findings.confirmed`.
  - Update the `Completed` section of the Work Registry with result summary and artifact refs.
- **Do not** modify `# Checklist progress` or `# Tested vectors`; those are derived later by the Main Agent.

### ReportAgent

- Single-owner for the **Report stage**:
  - Compiles final summaries from the Work Registry and Pentest State.
  - Confirms that all items in `Findings.confirmed` have corresponding **report_finding** records.
  - Produces final coverage/gaps summary.
- Does **not** run new tests or call **exec**.

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

### Claims (Locks)

- `TASK_ID: owner_session_id | lock_until | notes`
  - `owner_session_id`: `session_id` returned by `sessions_spawn(...)`.
  - `lock_until`: timestamp in the future (e.g. now + 15 minutes).
  - `notes`: brief description (e.g. “ReconAgent doing dirsearch on /”).

### Completed

- `TASK_ID | owner | result_summary | artifact_refs`
  - `owner`: `session_id`.
  - `result_summary`: short human-readable string.
  - `artifact_refs`: file paths, HAR names, or other references written via **write_file**.

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

### 3-Agent Default Mapping

- **Main Agent (Orchestrator)**:
  - Manages stages, Work Registry, and merges results.
- **Agent 1 (ReconAgent)**:
  - Headers/tech/WAF + robots/sitemap tasks.
- **Agent 2 (EnumAgent)**:
  - Dirsearch/paths + parameter map + auth surface discovery.
- **Agent 3 (VerifyAgent)**:
  - Verify tasks by vulnerability class, starting with IDOR/SQLi/XSS from `Findings.candidates`.

### Optional Additional Verify Agents

For larger workloads, Verify tasks may be split:

- `Verify-SQLi`: SQLi / NoSQLi candidates.
- `Verify-XSS`: reflected/stored XSS candidates.
- `Verify-IDOR/ACL`: IDOR and privilege escalation.
- `Verify-CSRF`: CSRF candidates.
- `Verify-Logic`: business logic & race conditions.

**ReportAgent** is always a **single-owner** for the Report stage and can be:

- A dedicated session (`sessions_spawn("ReportAgent")`), or
- The main orchestrator playing the report role alone.

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

