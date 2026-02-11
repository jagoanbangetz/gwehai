---
name: check-host
description: "Run distributed network checks from multiple global nodes using check-host.net API (ping/http/tcp/dns)."
---

# Check-Host Skill

Use this skill when the user asks for multi-region reachability checks or independent node-based validation.

## Before Running

1. Confirm target host/domain and check type (`ping`, `http`, `tcp`, `dns`).
2. Use `memory_search` first to avoid duplicate checks.
3. Keep checks lightweight (recon only).

## Steps

1. Start a check request with curl:
   - `https://check-host.net/check-ping?host=<HOST>&max_nodes=<N>`
   - `https://check-host.net/check-http?host=<HOST>&max_nodes=<N>`
   - `https://check-host.net/check-tcp?host=<HOST>&max_nodes=<N>`
   - `https://check-host.net/check-dns?host=<HOST>&max_nodes=<N>`
2. Parse `request_id` from response.
3. Poll result:
   - `https://check-host.net/check-result/<REQUEST_ID>`
   - optional extended result: `https://check-host.net/check-result-extended/<REQUEST_ID>`
4. Summarize by node:
   - success/failure
   - latency/time
   - status code or connection error
   - resolved addresses for DNS checks
5. Save concise notes via `write_file` (path: `main` or `daily/<domain>/YYYY-MM-DD`).

## Optional node targeting

- You can specify nodes:
  - `...&node=us1.node.check-host.net&node=ch1.node.check-host.net`
- You can list available nodes:
  - `https://check-host.net/nodes/ips`
  - `https://check-host.net/nodes/hosts`

## Safety

- Recon/intel only.
- Do not run high-frequency polling loops.
- Respect target scope and user request.

## Completion

- Return:
  - check type and target
  - nodes used
  - key outcomes by node
  - saved memory path

