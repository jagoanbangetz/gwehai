---
name: install-tools
description: "Install missing pentest tools in the execution environment (container). Use exec with apt-get, pip, or npm when a required tool is not available."
---

# Install Tools Skill

## Purpose

When a tool you need for recon or verification is **not available** in the pentest environment, you can **install it** using allowlisted install commands. Commands run inside the pentest-tools container (or host if not using Docker).

## When to Use

- **exec** fails because a command is not found (e.g. `nuclei`, `httpx`, a Python script dependency).
- You need a one-off tool for a specific test (e.g. `pip install sqlmap` if not preinstalled, or a niche scanner).
- The user or scope explicitly allows installing tools.

## Allowlisted Install Commands

You can use **exec** with these first words (no target required):

| Command   | Use for |
|----------|---------|
| **apt-get** | Debian/Ubuntu packages. Prefer: `apt-get update && apt-get install -y <pkg>`. |
| **apt**     | Same as apt-get on some images: `apt update && apt install -y <pkg>`. |
| **pip** / **pip3** | Python packages: `pip install <pkg>` or `pip3 install <pkg>`. |
| **npm**     | Node tools (global): `npm install -g <pkg>`. |

## Steps

1. **Check if the tool is already available** — e.g. `exec(command: "which nuclei")` or try running the tool once.
2. **If missing**, choose the right installer:
   - System package (Linux): `apt-get update && apt-get install -y <package-name>`.
   - Python: `pip3 install <package-name>` (or `pip`).
   - Node: `npm install -g <package-name>`.
3. **Run once** — e.g. `exec(command: "apt-get update && apt-get install -y nmap")`. No **target** needed for install commands.
4. **Retry your recon/verify step** after install succeeds.

## Safety

- Install only what you need for the current engagement. Avoid broad upgrades (`apt upgrade`) unless necessary.
- Use **-y** (or non-interactive flags) so the command does not hang waiting for input.
- If the environment is ephemeral (e.g. container restarts), re-install on next run or document the step in **write_file** (main or daily) so you can repeat it.

## Example

- `exec(command: "apt-get update && apt-get install -y nmap")`
- `exec(command: "pip3 install requests")`
- `exec(command: "npm install -g @microsoft/inshellisense")`

After install, use **memory_get(path: "skills/...")** and **exec** as usual for recon and verification.
