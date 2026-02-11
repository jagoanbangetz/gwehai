# Pentest AI Agent (OpenClaw-style)

This project is a **web security pentest AI agent**: it has **skills** and **tools**, and is focused on **doing pentests on websites** within scope — like OpenClaw, but for web security.

---

## What the agent has (like OpenClaw)

- **Skills** — Documented in `skills/skills/` (each has a SKILL.md):
  - **recon** — Map targets, enumerate paths, check headers/tech. Use memory first; exec only in-scope.
  - **verify** — Verify potential findings with allowlisted checks only; in-scope only.
- **Prompt** — System prompt references SOUL.md, AGENTS.md, SCOPE.md and the skills. The agent is instructed to use tools (memory_search, memory_get, write_file, exec) and to follow the recon/verify skills when the user asks.
- **Tools (backend)** — ToolsService implements: memory_search, memory_get, write_file, exec (allowlisted; scope-check for exec). See TOOLS.md.

So the agent **is** a pentest agent with skills and tools; the backend can run tools when the agent requests them (tool loop is the next step).

---

## Flow (chat and stream)

1. **User sends message** → POST /api/gwehai/chat with `{ message, conversation_id? }`.
2. **Backend** creates a job, starts the **agent loop in background**, returns `{ job_id, stream_id }` immediately.
3. **Frontend** opens GET /api/gwehai/chat/stream?stream_id=... and **polls job.events**; each event is sent as SSE (connected, status, message_delta, message_done, tool_start, tool_end, done).
4. **Agent loop** (background): calls LLM (with tools support); if the model returns tool_calls, run tools via ToolsService, push tool_start/tool_end to job.events, send results back to LLM; repeat until the model returns content only; then push message_delta, message_done, done.

---

## Next step: full tool loop

To have the AI **actually run** memory_search, memory_get, write_file, exec during a turn:

- **LlmService.generateWithTools** and **OpenAI provider** already support tool_calls (request + response).
- **GwehAIService.runAgentInBackground** currently does one LLM call (via ChatService.processMessage) and pushes the response as events. To add the tool loop: either move the loop into a new **ChatService.processMessageWithTools** (inject ToolsService, loop: generateWithTools → run tools → append tool results to messages → repeat), or run the loop in **GwehAIService** (inject LlmService + ToolsService, get conversation/model from ChatService, then loop and push events; at the end save the final assistant message via ChatService).

Once the loop is wired, the agent will behave like OpenClaw: **plan → call tools → get results → plan next → … → done**, with all events streamed to the frontend.

---

## Focus: web security

- **Scope** — SCOPE.md defines in-scope targets and rules; the agent must not suggest or run tests outside scope.
- **Tools** — exec is allowlisted (nmap, curl, dirsearch, etc.) and requires the target to be in scope.
- **Skills** — recon and verify are documented; the agent is instructed to use them when the user asks for recon or verification.
