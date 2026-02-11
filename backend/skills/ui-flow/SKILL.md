---
name: ui-flow
description: "UI-driven flow testing via Playwright — run node scripts/pw_flow.mjs with spec JSON; save HAR, screenshots, cookies; log artifacts via write_file."
---

# UI Flow Skill

## Purpose

Test UI-driven flows (login, multi-step forms, checkout) using a Node Playwright runner. **exec** runs `node scripts/pw_flow.mjs <spec.json>`. Generate a spec JSON template; fill selectors safely; save HAR, screenshots, cookies.json; log artifact paths via **write_file** so post-login-acl or other skills can use them.

## Preconditions

- Target in **SCOPE.md**.
- **memory_search**(query: target + "ui flow" or "playwright") — avoid re-running same flow.
- **memory_get**(path: "SCOPE.md") to confirm scope.
- Playwright runner available: `scripts/pw_flow.mjs` exists and accepts spec JSON path. If not, use **craft_payload** or **exec** with curl to simulate critical steps and document in write_file.

## Inputs

- **target URL** (base URL and start path, e.g. https://target.com/login).
- **Optional**: test credentials (user/pass) or email domain rules for registration.
- **Optional**: list of flows to test (login, registration, checkout) from recon.

## Workflow

### THINK

- Which UI flow is in scope (login, signup, checkout)? What are the steps (navigate, fill, click, submit)?
- Already tested (memory_search)? Retest only new flow or if user asked.
- Is target in SCOPE? Spec must use in-scope URLs only; selectors must be safe (no destructive actions).

### ACT

1. **memory_search**(query: target + "ui flow" or "playwright", max_results: 10).
2. **Build spec JSON** (template below). Fill: baseURL, steps (type, selector, value), artifactDir for HAR/screenshots/cookies. Save to workspace (e.g. workspace/flows/login_spec.json) via **write_file** or **craft_payload**.
3. **exec**(command: node scripts/pw_flow.mjs workspace/flows/login_spec.json, target: base URL). Runner must: launch browser, run steps, save HAR to artifactDir/har.json, screenshots to artifactDir/*.png, cookies to artifactDir/cookies.json.
4. **Observe**: exit code, stdout/stderr; check artifactDir for HAR, screenshots, cookies.json.
5. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Checklist progress: UI flow — [flow name]. Artifacts: HAR=artifactDir/har.json, screenshots=artifactDir/*.png, cookies=artifactDir/cookies.json. Tested vectors: [steps]."). This logs artifact references for post-login-acl.
6. If flow fails (e.g. selector not found): update spec (selector, wait conditions) and re-run once; document in write_file. **report_finding** only if security issue (e.g. sensitive data in URL, missing CSRF) observed in HAR/screenshot.

### OBSERVE

- Playwright stdout/stderr (success, selector not found, timeout); artifact files (HAR entries, screenshot content, cookies.json keys).

### REFLECT

- Are artifact paths logged in write_file so post-login-acl can use cookies/HAR? If not, add to write_file.
- Only in-scope URLs and safe selectors (no delete, no transfer funds unless PoC and scope allows).

### LOG

- **write_file**: "UI flow — [name]. Artifacts: HAR=<path>, screenshots=<path>, cookies=<path>. Tested vectors: [steps]. Checklist progress: UI flow — done."
- **report_finding** only when security finding (e.g. token in URL, CSRF missing) with evidence = HAR/screenshot reference.

## Spec JSON template

Use this template and fill baseURL, steps, and artifactDir. Selectors must be safe (input names, button text, data-testid; avoid fragile XPath). No destructive actions in steps.

```json
{
  "baseURL": "https://target.com",
  "artifactDir": "workspace/artifacts/login_flow",
  "steps": [
    { "type": "goto", "url": "/login" },
    { "type": "fill", "selector": "input[name=email]", "value": "test@test.com" },
    { "type": "fill", "selector": "input[name=password]", "value": "testpass" },
    { "type": "click", "selector": "button[type=submit]" },
    { "type": "wait", "selector": "body.logged-in", "timeout": 5000 }
  ],
  "saveHar": true,
  "saveScreenshots": true,
  "saveCookies": true
}
```

**How to fill selectors safely**: Prefer name, id, data-testid, or role. Avoid positional XPath. Test selectors on staging first if available. For password/value use test credentials only.

## Confirmation criteria

- Flow completes (or fails with documented reason); artifacts (HAR, screenshots, cookies.json) saved; artifact paths logged in write_file for post-login-acl.

## Proof requirements

- For security findings: **poc** = step that triggered issue + HAR excerpt or screenshot path. **evidence** = HAR file path or screenshot path.

## Tool calls guidance

- **exec**: `node scripts/pw_flow.mjs workspace/flows/login_spec.json` — run from repo root; target = base URL for scope check.
- **write_file**: Path main or daily/website/YYYY-MM-DD; content must include "Artifacts: HAR=..., screenshots=..., cookies=...".
- **write_file**: Path workspace/flows/login_spec.json (or similar) to create spec if runner reads from file.

## Safety limits

- **Stop**: Timeout (e.g. 30s per flow), selector not found after one retry; log and continue. No destructive steps (no delete account, no real payment).
- **In-scope only**. **PoC only**: test credentials; no real user data.

## Output fields for report_finding (only when security finding)

- **title**: `UI flow — [issue]` (e.g. "UI flow — Token in URL in HAR").
- **severity**: As appropriate (e.g. medium for token in URL).
- **target**: base URL and flow name.
- **description**: Issue, step, impact, steps to reproduce.
- **poc**: Step + HAR excerpt or screenshot path.
- **evidence**: HAR path or screenshot path (saved in artifactDir).
