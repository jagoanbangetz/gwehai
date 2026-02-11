---
name: dns-intel
description: "Collect DNS and domain intelligence (whois, dig, nslookup-like checks, reverse whois lookup via viewdns) for a target domain."
---

# DNS Intel Skill

Use this skill when the user asks to gather DNS/domain information, ownership context, or related domains.

## Before Running

1. Confirm target domain (for example: `google.com`).
2. Use `memory_search` first to avoid repeating the same DNS checks.
3. Stay focused on reconnaissance/intel only (no intrusive actions).

## Steps

1. Basic DNS/WHOIS:
   - `whois <domain>`
   - `dig <domain> A +short`
   - `dig <domain> MX +short`
   - `dig <domain> NS +short`
2. Reverse whois lookup (viewdns):
   - `curl -L "https://viewdns.info/reversewhois/?q=<domain>&t=1"`
   - Replace `<domain>` dynamically from user input.
3. Summarize findings:
   - registrant/org clues (if visible)
   - nameservers, key DNS records
   - related domains from reverse whois page (if available)
4. Save concise notes using `write_file` (path: `main` or `daily/<domain>/YYYY-MM-DD`).

## Safety

- Recon/intel only.
- Do not run brute-force or high-volume DNS attacks from this skill.
- If domain is unclear or missing, ask user before running.

## Completion

- Return a short, structured result:
  - target domain
  - DNS records summary
  - reverse whois summary
  - saved memory path

