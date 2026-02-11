---
name: subdomain-finder
description: "Enumerate and review subdomains using C99 Subdomain Finder scan pages and public scan data."
---

# Subdomain Finder Skill (C99)

Use this skill when the user asks to find subdomains or review public subdomain scan results from C99.

## Before Running

1. Confirm target domain (for example: `example.com`).
2. Use `memory_search` first to avoid duplicate lookups.
3. Clarify privacy preference:
   - public scan page, or
   - private scan mode (if user requests privacy).

## Steps

1. Open or fetch a C99 scan page:
   - `https://subdomainfinder.c99.nl/scans/<YYYY-MM-DD>/<domain>`
2. Extract key fields:
   - scan date
   - total subdomains found
   - most used IP
   - subdomain list (host, IP, cloudflare indicator if present)
3. If scan is not ready, note status and suggest retry.
4. Cross-check key hosts/IP with basic DNS lookups when needed (`dig`, `whois`, `curl`).
5. Write concise notes to memory (`write_file`):
   - `main` or `daily/<domain>/YYYY-MM-DD`

## Example

- Input page:
  - `https://subdomainfinder.c99.nl/scans/2026-02-10/sangat-man.top`
- Useful output summary:
  - total subdomains
  - discovered hosts
  - repeated IPs
  - cloud service hints (e.g. Cloudflare on/off)

## Safety

- Recon/intelligence only.
- Use only public data sources unless user provides authorization for deeper checks.
- Do not run destructive or intrusive actions from this skill.

## Completion

- Return a clear summary:
  - target domain
  - number of subdomains found
  - top hosts/IP observations
  - saved memory path

