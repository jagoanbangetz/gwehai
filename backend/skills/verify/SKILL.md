---
name: verify
description: "Verify potential findings — use allowlisted verification only (e.g. confirm SQLi/XSS with safe payloads). Do not run arbitrary exploits; only in-scope targets."
---

# Verify Skill (Web Pentest)

Use this skill when you have **identified a potential vulnerability** (e.g. from recon or user report) and need to **verify** it with a safe, proof-of-concept check.

## Before Running

1. **Scope** — The target and URL must be in SCOPE.md. No verification against out-of-scope assets.
2. **Allowlist** — Only use **exec** with allowlisted tools. **For SQLi:** use **sqlmap** (e.g. `sqlmap -u "URL" --level=1 --risk=1 --batch`), not only curl with a single quote. For XSS you may use curl with a single test payload. Do not run raw exploit code from the model.
3. **Memory** — Use **memory_search** / **memory_get** for prior findings on this target so you don’t re-verify the same issue.

## Steps

1. **State the hypothesis** — e.g. "Parameter `id` may be vulnerable to SQLi."
2. **Run verification** — Use **exec** with the right tool: **sqlmap** for SQL injection (e.g. `sqlmap -u "http://target/page?param=value" --level=1 --risk=1 --batch`); curl with a single payload for XSS. Pass **target** so scope is enforced. Do not skip sqlmap when you suspect SQLi — run it to confirm and characterize the injection.
3. **Document** — Use **write_file** to record: what you tested, what you observed, whether it confirms the finding. Attach evidence path if you saved a response or screenshot.
4. **Report with proof** — When the finding is confirmed, call **report_finding** with **poc** containing **concrete evidence** from the response or tool output:
   - **SQLi:** In poc include the payload AND the proof (e.g. database name from error or sqlmap output, or response snippet). Example: "Payload: id=1' UNION SELECT 1,@@version-- | Response: MySQL 5.7.33" or "sqlmap: current database: 'acuart'".
   - **XSS:** In poc include the payload AND evidence the script executed (e.g. "Payload: <script>alert(1)</script> | Proof: alert(1) triggered" or response snippet showing reflection).
   - **Other:** In poc include request/command AND response or output snippet that proves the bug. Without a sample of proof, the finding is incomplete.

## Safety

- **No destructive actions** — No DROP TABLE, no deleting data, no credential stuffing.
- **Proof-of-concept only** — One or a few requests to confirm; no mass fuzzing unless the user explicitly approved it.
- If the user did not approve verification, or the target is not in scope, **ask** before running.

## Completion

- Reply with: confirmed / not confirmed / inconclusive, and where you wrote the note (e.g. daily/2026-02-09 or reports/).
- If **confirmed**, you must call **report_finding** with **detail** and **poc** (poc must show proof: DB name for SQLi, payload+evidence for XSS, response snippet for others).
