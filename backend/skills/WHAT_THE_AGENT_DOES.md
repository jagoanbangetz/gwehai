---
summary: "What the pentest AI agent does end-to-end — recon, find, verify, report"
read_when:
  - You want the big picture of how the agent pentests a website
---

# What the AI Does — Pentesting the Website

After you set up the **prompt** (SOUL, AGENTS, SCOPE, first prompt), **memory** (conversation memory in the database: main, daily/website/YYYY-MM-DD), and **tools** (memory, recon, verification, reporting), the AI acts as a **web penetration testing assistant**. It will **pentest the website** in a scope-bound, methodical way: recon → find potential issues → verify (within safety bounds) → document and report.

---

## In short

**Yes — the AI will pentest the website**, using the tools you give it and staying within SCOPE. It does **not** run arbitrary exploits or out-of-scope attacks. It:

1. **Reads scope and memory** — knows what’s in scope and what was done before.
2. **Uses the web pentest checklist** — loads **skills/WEB_CHECKLIST.md** for full assessments (recon, input handling, auth, access control, other). **Does not stop after one finding** — continues through the checklist until all test areas are covered or confident all tests are done. Tracks "Checklist progress" in conversation memory.
3. **Does recon** — fetches pages, crawls links, enumerates paths/subdomains, checks headers/tech (using your recon tools).
4. **Looks for issues** — uses the model’s reasoning + tool results to identify possible vulns (e.g. SQLi, XSS, auth bypass).
5. **Verifies (safely)** — runs your **verification** tools (e.g. sqlmap for SQLi, curl for XSS) with allowlisted payloads, only on in-scope targets.
6. **Documents and reports** — saves findings to memory and **report_finding** for every confirmed vuln; then continues to the next checklist section.

So “pentest the website” = the AI **orchestrates** recon and verification via tools, interprets results, and writes findings — all within scope and your safety rules.

---

## Typical flow (example)

1. **User:** “Pentest https://example.com” or “Run recon on example.com.”
2. **Agent:**  
   - Reads SCOPE (or you confirm example.com is in scope).  
   - Uses **memory_search** for prior notes on example.com, then **memory_get** if needed.  
   - Calls **fetch_url** / **crawl_url** to map the site (links, forms).  
   - Calls **headers_inspect**, **tech_detect**, **dir_brute** as needed.  
3. **Agent:**  
   - From responses, infers possible issues (e.g. “search param might be SQLi”, “reflected input might be XSS”).  
   - For each, may call **verify_sqli**, **verify_xss**, etc. (only in-scope, allowlisted).  
4. **Agent:**  
   - Calls **save_finding** or **write_file** to store findings (title, severity, evidence).  
   - Updates **memory** (write_file path: main or daily/website/YYYY-MM-DD) with what was tested and what was found.  
5. **Agent:**  
   - Replies to the user with a summary and next steps (e.g. “Recon done; 3 potential issues; verified 1 SQLi; report saved in reports/2026-02-08.md”).

So the AI **does** pentest the website by **using your tools** in a loop: recon → analyze → verify → document → repeat until done or user stops.

---

## What the AI does *not* do

- **Out-of-scope targets** — only what’s in SCOPE (or you explicitly add).
- **Arbitrary exploit code** — only verification tools with allowlisted payloads (no raw “run this exploit” from the model).
- **Destructive actions** — no DROP TABLE, no wiping data, no DoS; verification is proof-of-concept only.
- **Ignore memory** — it’s instructed to use memory_search / memory_get so it doesn’t re-test the same thing blindly.

---

## Summary

| Question | Answer |
|----------|--------|
| Will the AI pentest the website? | **Yes** — by calling your recon and verification tools, staying in scope, and writing findings to memory and reports. |
| Who does the actual work? | **Your tools** (fetch_url, crawl_url, verify_sqli, etc.). The AI decides **what** to call and **how** to interpret results. |
| Is it safe? | Only if you **enforce scope** (target in SCOPE) and **allowlisted verification** (no arbitrary payloads). |
| What does the user get? | A guided pentest: recon results, list of potential/verified issues, and findings/reports written to the workspace (or DB). |

So after all of that setup, the AI **is** the one “pentesting the website” — in a controlled, scope-bound way, using the tools you implemented.
