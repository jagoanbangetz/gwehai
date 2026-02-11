---
name: jwt-session
description: "JWT/session — algorithm confusion, weak secret, missing validation, token in URL. PoC only; report_finding with token + response evidence."
---

# JWT / Session Skill

## Purpose

Test JWT and session handling: algorithm confusion (alg: none / RS256→HS256), weak secret, missing signature validation, token in URL or response. PoC only; no brute-force; safe payloads (e.g. role change to test value).

## Preconditions

- Target in **SCOPE.md**.
- **memory_search**(query: target + "JWT" or "session" or "token") — avoid re-testing.
- **memory_get**(path: "SCOPE.md") to confirm scope.
- Identify auth endpoints that return JWT or Set-Cookie from recon or auth-journey.

## Inputs

- **target URL** (base URL and login/auth endpoint).
- **Optional**: test credentials for obtaining valid JWT/session.
- **Optional**: list of endpoints that accept Authorization or Cookie from recon.

## Workflow

### THINK

- Does the app use JWT (Authorization: Bearer) or session cookies? Where is token set (login response, cookie)?
- Already tested (memory_search)? Retest only new endpoints or if user asked.
- Is target in SCOPE? PoC only (e.g. alg none or role=user→admin for test); no mass brute-force.

### ACT

1. **memory_search**(query: target + "JWT" or "session", max_results: 10).
2. **Obtain valid token**: **exec**(curl -X POST -d "user=u&pass=p" LOGIN_URL) — capture Set-Cookie or response body (JWT).
3. **JWT structure**: Decode JWT (header.payload.signature); check alg in header; check payload (sub, role, exp). **craft_payload** to decode base64 if needed (30s).
4. **Algorithm confusion / alg:none**: **craft_payload** to build JWT with alg:none and modified payload (e.g. role: admin); **exec**(curl -H "Authorization: Bearer MODIFIED_JWT" PROTECTED_URL). **report_finding** if request succeeds with modified token.
5. **Weak secret / missing validation**: If JWT is HS256, try common secret (e.g. "secret", "password") via **craft_payload** (small script); **exec** with forged token. **report_finding** if accepted. No mass brute-force.
6. **Token in URL**: Check if token appears in Referer, redirect, or response body; **report_finding** if token leaked in URL.
7. **write_file**(path: main or daily/website/YYYY-MM-DD, content: "Checklist progress: JWT/session — tested: [vectors]; result: confirmed/not found. Tested vectors: [list].").

### OBSERVE

- Login response (Set-Cookie, body with token); protected endpoint response (200 vs 401 with modified token); token placement (URL, body, header).

### REFLECT

- Is proof in poc (original token vs modified token + response)? If not, do not mark done.
- Only PoC (alg none, one weak secret, role change to test); no brute-force.

### LOG

- **write_file**: "Tested vectors: [vector type, endpoint, result]. Checklist progress: JWT/session — done."
- **report_finding** for every confirmed JWT/session flaw before marking phase done.

## Confirmation criteria

- **Alg none**: Server accepts JWT with alg:none and modified payload (e.g. role escalation).
- **Weak secret**: Forged JWT signed with common secret is accepted.
- **Token in URL**: Token appears in URL (redirect, Referer, or response) and can be leaked.

## Proof requirements

- **poc**: Original token (redacted) + modified token or forged token + request (Authorization header) + response (200 with elevated access or token in URL).
- **evidence**: Response snippet or HAR; for token in URL include full URL (redact secret part if needed).

## Tool calls guidance

- **exec**: `curl -s -X POST -d "user=u&pass=p" "https://target.com/login"` — capture token. `curl -s -H "Authorization: Bearer MODIFIED_JWT" "https://target.com/api/admin"`.
- **craft_payload**: Script to decode JWT (base64), build JWT with alg:none or sign with weak secret (e.g. node or python); 30s max.
- **write_file**: Path main or daily/website/YYYY-MM-DD; append "Tested vectors" and "Checklist progress".

## Safety limits

- **Stop**: 429, lockout, or WAF; log and continue. **No brute-force**: try only alg:none and one or two common secrets; no mass secret guessing.
- **In-scope only**. **PoC only**: role change to test value; no destructive privilege use.

## Output fields for report_finding

- **title**: `JWT — [issue]` (e.g. "JWT — Algorithm confusion (alg:none) allows role escalation").
- **severity**: high/critical for alg:none or weak secret; medium for token in URL.
- **target**: Login or protected endpoint URL.
- **description**: Issue type, impact (e.g. role escalation), steps to reproduce.
- **poc**: Token (redacted) + modified/forged token + request + response.
- **evidence**: Response snippet or HAR.
