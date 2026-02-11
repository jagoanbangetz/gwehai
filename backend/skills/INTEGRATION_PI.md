# Pi libraries integration (pi-ai, pi-agent-core, pi-coding-agent)

This document describes where and how the **@mariozechner/pi-*** packages (v0.52.8) are integrated so the agent can use them for LLM calls, agent loop, and **payload/code crafting**.

---

## 1. **@mariozechner/pi-ai** — LLM layer

- **Placement:** `backend/src/llm/`
- **Role:** Unified LLM API (multiple providers, token/cost tracking).
- **Integration:**
  - Optional **pi-ai provider** in `backend/src/llm/providers/pi-ai.provider.ts` can implement `LlmProvider` using pi-ai’s `getModel()` and register in `LlmModule`.
  - Use when you want to route some models through pi-ai for consistent API and usage tracking.
- **Current state:** Dependencies added in `package.json`. Provider stub can be added when you want to switch or complement the existing OpenAI-compatible provider.

---

## 2. **@mariozechner/pi-agent-core** — Agent loop

- **Placement:** `backend/src/agent/`
- **Role:** Stateful agent runtime with tool execution and event streaming (built on pi-ai).
- **Integration:**
  - New module `backend/src/agent/` with `AgentService` that creates an `Agent` from pi-agent-core, registers pentest tools (and optionally coding tools), and runs the agent loop.
  - Events from the agent can be mapped to the existing SSE stream (e.g. `tool_start`, `tool_end`, `message_delta`).
  - Can be used as an **alternative** to the current chat tool loop (e.g. “coding mode” or future refactor).
- **Current state:** Dependencies added. Agent module can be added when you want to use pi-agent-core’s `Agent` and `createAgentSession()` with `customTools` for pentest + payload tools.

---

## 3. **@mariozechner/pi-coding-agent** — Payload / code crafting

- **Placement:** `backend/src/tools/` (payload sandbox)
- **Role:** Coding tools (read, write, bash) in a **sandbox** so the AI can craft and run payload code safely (e.g. generate a small script and run it).
- **Integration:**
  - **PayloadSandboxService** (`backend/src/tools/payload-sandbox.service.ts`): provides a sandbox directory (e.g. `workspace/payloads`) and runs user-provided scripts there. Implemented with our own fs + exec for reliability; can later use pi-coding-agent’s `createBashTool`, `createWriteTool`, `createReadTool` with the same sandbox `cwd` when using pi-agent-core.
  - **Tool `craft_payload`** in `PENTEST_TOOL_DEFS`: AI can call it with a script (e.g. bash or Python one-liner) and optional description; the script is run in the sandbox and stdout/stderr/exitCode are returned.
- **Current state:** `craft_payload` tool def added; `PayloadSandboxService` implemented; chat service calls it from `runTool`. The AI can craft payloads by code (e.g. “run this bash script to test SQLi”) without leaving the pentest tool set.

---

## Summary table

| Library            | Suggested location   | Purpose                                      |
|--------------------|----------------------|----------------------------------------------|
| **pi-ai**          | `backend/src/llm/`   | Optional LLM provider (getModel, token/cost) |
| **pi-agent-core** | `backend/src/agent/`| Optional agent loop (Agent + customTools)   |
| **pi-coding-agent**| `backend/src/tools/`| Payload sandbox (read/write/bash in cwd)     |

---

## Payload sandbox (craft_payload)

- **Sandbox dir:** `PENTEST_WORKSPACE/payloads` or `process.cwd()/skills/payloads`. All script runs are inside this directory; path traversal is rejected.
- **Tool:** `craft_payload(script, description?)` — writes the script to a temp file in the sandbox, runs it with `bash`, returns `{ stdout, stderr, exitCode }`.
- **Safety:** Only the sandbox dir is writable/executable for this tool; allowlisted pentest CLI tools (nmap, sqlmap, etc.) remain separate via `exec`.

After `npm install`, you can optionally add the pi-ai provider and the agent module and wire pi-coding-agent’s tools into the pi-agent-core agent when using that path.
