---
name: git-search
description: "Find data on GitHub — wordlists, payloads, tools, recon scripts, and examples. Use git_search when you need a wordlist (e.g. ffuf, gobuster), payload list (SQLi, XSS), nuclei template, or tool usage example."
---

# Git Search Skill

## Purpose

Find **wordlists, payloads, tools, and examples on GitHub** when you need them for recon or verification. Use the **git_search** tool to query a GitSearch API (e.g. GitSearchAI backend) and get back relevant repos, files, or code snippets.

## When to Use

- You need a **wordlist** for ffuf, gobuster, dirsearch, or similar (e.g. "wordlist ffuf", "directory wordlist common").
- You need **payloads** for SQLi, XSS, LFI, or other tests (e.g. "sqli payloads", "xss payload list").
- You want **nuclei templates**, **recon scripts**, or **tool usage examples** from GitHub.
- The user asks for "find a wordlist for X" or "search GitHub for Y".

## Tool: git_search

- **query** (required): Search string. Examples:
  - `wordlist ffuf`
  - `sqli payloads`
  - `nuclei template cve`
  - `subdomain enum script`
  - `xss payload list`
- **api_url** (optional): Override the GitSearch API URL. Default uses a public GitSearch backend (e.g. gitsearchai.com).

Returns a list of results (repos, files, snippets). Use the URLs or descriptions to choose a wordlist/repo, then **exec** (e.g. curl, wget) or document the link for the user.

## Steps

1. **Decide what you need** — wordlist, payload file, script, or example.
2. **Call git_search** with a clear query (e.g. `git_search(query: "wordlist ffuf")` or `git_search(query: "nuclei template sql injection")`).
3. **Interpret results** — extract repo URLs, raw file URLs, or snippets. If the API returns repo links, you can suggest the user clone or download; or use **exec** with curl/wget to fetch a raw file if in scope.
4. **Use the finding** — e.g. run ffuf with a discovered wordlist URL, or **write_file** to main/daily to note the link for later.

## Safety

- **git_search** only performs a read-only search; it does not clone or execute code from GitHub.
- When using results (e.g. downloading a wordlist via exec), stay in scope and use allowlisted commands (curl, wget if allowlisted). Prefer well-known repos when possible.
- Do not expose secrets or tokens in queries.

## Example Queries

| Need | Example query |
|------|----------------|
| FFuf wordlist | `wordlist ffuf` |
| Directory brute wordlist | `directory wordlist common` |
| SQLi payloads | `sqli payloads` or `sql injection wordlist` |
| Nuclei template | `nuclei template` |
| Subdomain enum | `subdomain enum script` |
| XSS payloads | `xss payload list` |

Load this skill with **memory_get(path: "skills/git-search/SKILL.md")** when you need to find data on GitHub during recon or before running a tool.
