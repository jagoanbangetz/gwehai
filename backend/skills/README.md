---
summary: "Web penetration testing agent — memory and prompt templates"
read_when:
  - Integrating memory and prompt concepts into a web security / pentest AI agent
---

# Web Penetration Testing Agent — Memory & Prompt Templates

This folder contains **workspace templates** for an AI agent focused on **web penetration testing** and **web security engineering**. The concept mirrors OpenClaw’s memory and prompt layout, but is tailored for scope-aware, authorization-first security work.

## Pentest skills (OpenClaw-style)

Skills define what the AI agent can do during a web pentest. Each skill has a `SKILL.md` with:

- `name` - skill identifier (for example, recon, verify)
- `description` - short summary for the model and tools
- `steps` - how to run the skill (use memory, exec, write_file; stay in scope)
- `safety` - scope, allowlist, and completion rules

The agent is instructed to use these skills when the user asks for recon, verification, or reporting. Tools (`memory_search`, `memory_get`, `write_file`, `exec`) are enforced by the backend; skills tell the agent when and how to use them.

### Skills

| Skill | Use when |
|------|----------|
| **recon** | User asks to recon a target, map a site, enumerate paths/subdomains, or check headers/tech. |
| **verify** | User or agent has a potential finding and needs to verify it with a safe, allowlisted check. |
| **image-to-text** | User asks to extract text from screenshots/images (OCR). |
| **dns-intel** | User asks for DNS/domain intelligence (whois, records, reverse whois / related domains). |
| **check-host** | User asks for distributed network checks across multiple nodes (ping/http/tcp/dns). |
| **subdomain-finder** | User asks to enumerate/review subdomains from C99 Subdomain Finder scan pages. |
| **waf-bypass** | User asks about WAF blocking or bypass techniques and wants defensive guidance. |
| **burp-style-agent** | User asks for Burp Suite-style web testing (proxy/repeater/intruder-style guidance). |

### Adding a skill

1. Create a folder under `skills/<name>/`.
2. Add `SKILL.md` with frontmatter (`name`, `description`) and sections: Before Running, Steps, Safety, Completion.
3. Reference the skill in the system prompt (for example: "For recon, follow skills/recon/SKILL.md").

## Concept (same as OpenClaw, focused on web security)

- **Memory** = conversation memory stored in the database (JSON). Keys: **main** (long-term) and **daily/YYYY-MM-DD** (daily notes). No .md files. The agent “remembers” only what is written there.
- **Prompt** = system instructions (e.g. from SOUL.md and AGENTS.md) that tell the agent who it is, when to read memory, and how to stay in scope.
- **Recall** = the agent uses **memory_search** (search in DB) and **memory_get** (path: main or daily/YYYY-MM-DD) so it does **not** load all memory into every request — only what it needs per turn.
- **Writing memory** = the agent uses **write_file** (path: main or daily/YYYY-MM-DD) to save notes to the database.

## Files in this template

| File | Purpose |
|------|--------|
| **SOUL.md** | Persona and boundaries: “who” the agent is (web security agent), authorization-first, methodical, documentation-first. |
| **AGENTS.md** | Workspace rules: when to read SOUL, SCOPE, memory; when to write memory; safety (in-scope only, no production abuse). |
| **MEMORY.md** | Template for **main** memory content: in-scope targets (summary), critical findings, operator/client preferences. Actual memory is stored in the database (key: main). |
| **SCOPE.md** | Rules of engagement: in-scope targets, out-of-scope, allowed methods, forbidden actions, engagement window. |
| **FIRST_PROMPT.md** | Copy-paste system prompt (first prompt) for your agent, including NestJS usage and **Cursor setup** (install-tools.sh, Playwright) to install all needed. |
| **TOOLS.md** | Tools the agent can use: memory_search, memory_get, read_file, write_file, optional browser/exec; NestJS tool definitions. |
| **WHAT_THE_AGENT_DOES.md** | End-to-end flow: what the AI does when it pentests a website (recon → find → verify → report). |
| **install-tools.sh** | Automation installer for pentest CLI tools (nmap, masscan, dig, whois, sqlmap, wfuzz, nikto, curl, netcat, traceroute, sslyze, etc.) on Debian/Ubuntu, Fedora/RHEL, macOS. |
| **Dockerfile.pentest-tools** | Docker image with the same tools; run them inside a container (see below). |

## Running pentest tools in Docker

Instead of installing tools on the host, you can run them **inside a container**:

1. **Build and start** (from repo root):
   ```bash
   docker compose up -d pentest-tools
   ```
   The container stays running (`sleep infinity`) so the backend can run commands inside it.

2. **Run a tool** (examples):
   ```bash
   docker exec gwehai-pentest-tools nmap -sV -p 80,443 example.com
   docker exec gwehai-pentest-tools sqlmap --version
   # example: run sqlmap against a target URL
   docker exec gwehai-pentest-tools sqlmap -u http://example.com/page.php?id=1 --level=1 --risk=1 --batch
   ```
   Or one-off: `docker compose run --rm pentest-tools nmap -sV example.com`

3. **Backend integration**  
   The backend **runs exec commands inside the container by default**. Start the container with `docker compose up -d pentest-tools` (from repo root); then when the agent uses **exec**, the backend runs `docker exec gwehai-pentest-tools <allowlisted-cmd>` (or your `PENTEST_TOOLS_CONTAINER_NAME`).  
   - **Env (optional):** `PENTEST_TOOLS_CONTAINER_NAME=gwehai-pentest-tools`, `PENTEST_RUN_IN_CONTAINER=true` (default). Set `PENTEST_RUN_IN_CONTAINER=false` to run tools on the host instead.

## What the AI does (pentesting the website)

After setup, the AI **pentests the website** by using your tools in a scope-bound loop: it reads SCOPE and memory, runs recon (fetch, crawl, dir_brute, etc.), infers potential issues, runs verification tools (e.g. verify_sqli, verify_xss) with allowlisted payloads, and writes findings to memory and reports. See **[WHAT_THE_AGENT_DOES.md](./WHAT_THE_AGENT_DOES.md)** for the full flow and what it does *not* do.

## Implementation guide

For **step-by-step implementation** (workspace layout, system prompt text, how to implement `memory_search` and `memory_get`, session start flow, scope enforcement), see **[IMPLEMENTATION.md](./IMPLEMENTATION.md)**.

## How to use in your AI agent

1. **Copy into your agent workspace**  
   Copy SOUL.md, AGENTS.md, MEMORY.md (template), and SCOPE.md into the root of the workspace your agent uses (e.g. `~/pentest-workspace/` or your app’s equivalent). Memory content is stored in the database (main, daily/YYYY-MM-DD).

2. **System prompt**  
   In your agent’s system prompt, include instructions such as:
   - “You are a web penetration testing assistant. Read SOUL.md for persona and boundaries; read SCOPE.md for rules of engagement.”
   - “Before suggesting or running any security checks: run memory_search for this target, prior findings, and preferences; use memory_get (path: main or daily/YYYY-MM-DD) to pull only the chunks you need.”
   - “Do not suggest or run tests outside SCOPE.md. When in doubt, ask.”

3. **Memory tools**  
   Expose at least:
   - **memory_search(query)** — search conversation memory in the database; return short snippets (path, lines).
   - **memory_get(path, from?, lines?)** — read memory by path: main or daily/YYYY-MM-DD (stored in DB; optional line range).

   The agent should use these **on demand** (search first, then get only what’s needed), not load all memory into the prompt.

4. **Daily notes**  
   Use **daily/YYYY-MM-DD** (write_file path) for daily session notes: what was tested, URLs, one-liners, follow-ups. Memory is in the database; no .md files.

5. **Scope and safety**  
   Keep SCOPE.md and conversation memory (main) up to date when scope or critical findings change. Enforce in your agent logic that tests are only suggested or run when they align with SCOPE.md (and any extra authorization checks you implement).

## Memory layout (summary)

- **main** — curated long-term (in DB): key targets, critical findings, preferences, engagement notes. Load only in the main, private session (not in shared/group context).
- **daily/YYYY-MM-DD** — daily logs (in DB): what was tested, what was found, what’s left. Append-only per day.
- **SCOPE.md** — rules of engagement; read at session start and before new phases.
- **SOUL.md** / **AGENTS.md** — persona and workspace rules; read at session start (or baked into system prompt).

## Why this keeps requests from getting too long

- The agent does **not** load all memory into every request.
- It uses **memory_search** to get a small set of relevant snippets, then **memory_get** only for the chunks it needs. So “memory” in the request stays bounded.
- Daily keys (daily/YYYY-MM-DD) can be limited to “today + yesterday” or the last N days if you want to cap context further.

## Customization

- Add more sections to main memory (e.g. “Client contacts”, “Report templates”) via write_file path: main.
- Extend SCOPE.md with environment-specific rules (e.g. staging vs production).
- Adjust SOUL.md and AGENTS.md to match your tooling (e.g. specific scanners, browser automation) and your reporting style.

These templates are generic enough to drop into any web pentest agent that uses conversation memory (database), SCOPE, and optional memory_search / memory_get tools.
