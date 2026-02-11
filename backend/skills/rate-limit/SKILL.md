---
name: rate-limit
description: "Rate limiting & anti-automation — safe, low-volume checks for auth and API throttling. PoC only; no brute force; report_finding per confirmed weakness."
---

# Rate Limiting & Anti-Automation Skill

## Purpose

Identify missing or weak rate limiting and anti-automation controls on authentication and other sensitive endpoints, using **small, safe request bursts only**. Focus on:

- Login, registration, password reset, OTP/verification, and related auth APIs.
- API per-endpoint throttling (HTTP 429 / Retry-After behavior).
- Distinguishing IP-based vs account-based rate limits.

All confirmed weaknesses must be recorded via **report_finding** with clear request counts and response timeline.

## Preconditions

- Target is in **SCOPE.md** via **memory_get**(path: "SCOPE.md"); do not test out-of-scope domains or IPs.
- Use **memory_search**(query: target + "rate limit" or "brute force" or "login" or "otp", max_results: 10) to avoid duplicate testing.
- Confirm you have at least one relevant endpoint:
  - Paths including `/login`, `/register`, `/signup`, `/forgot`, `/reset`, `/otp`, `/verify`, `/api/auth`, `/api/login`, `/api/token`.
  - Or responses with 401/403 indicating an auth boundary.
- Prepare a small list of **test identities** (emails/usernames/phones) that you are allowed to use.
- Set a **log path** under `daily/<target>/<YYYY-MM-DD>/rate-limit.log` for this session.

## Safety Limits

- **No destructive testing; no brute force.**
  - Max **5–8 requests per endpoint per identity** in any burst.
  - Max **2–3 small bursts** per endpoint during this skill, spaced in time.
- **Stop immediately** when you see:
  - Clear account lockout or "too many attempts" message.
  - CAPTCHA or other strong anti-bot challenges suddenly appearing.
  - A "storm" of 429 responses (e.g. 3+ consecutive 429s for the same identity or IP).
- Prefer **single-threaded sequences** (no high-concurrency blasting).
- Only use **exec** for safe tools (curl, wfuzz if available, small node scripts) and stay within 30s per **craft_payload**.

---

## THINK

- Which endpoints are **authentication or sensitive flows** (login, register, reset, OTP, verify, auth APIs)?
- Has rate limiting or brute force already been tested here (check **memory_search**)?
- What is your **safe cap** for this target (e.g. 5 attempts per identity in one short burst)?
- How will you distinguish **IP-based vs account-based** behavior:
  - Same identity from same IP vs different identities from same IP.
  - Same identity from different IPs (if in-scope and safe to test).

---

## ACT

When sending requests, always:

- Use **exec** with curl (or wfuzz if available) for small, controlled sequences.
- Space requests slightly (e.g. 1–2 seconds) if needed to reduce stress.
- Track **timestamp, request count, identity, IP (if varied), and HTTP status**.

### 1) Login rate limiting (small safe burst)

1. Pick one login endpoint (e.g. `/login` or `/api/auth/login`) and **one test identity**.
2. Send a **baseline request** with an invalid password and record status/body.
3. Send a **small burst** of **3–5 more invalid attempts** for the same identity:
   - Same IP, same identity, different passwords or same password is fine.
   - Use **exec**(curl ...) or **craft_payload** to orchestrate the sequence.
4. Observe if responses change (e.g. delay, lockout message, 429, CAPTCHA).
5. Optionally repeat with **another identity** (same IP) within the same safety caps.

### 2) OTP / verify / resend rate limiting

1. Identify endpoints like `/otp`, `/verify`, `/resend`, `/api/auth/verify`, `/api/auth/otp`.
2. For **OTP submission**:
   - Send **1 valid or format-correct attempt** (if you have an OTP).
   - Then send **2–4 invalid OTPs** for the same session/identity.
3. For **resend OTP**:
   - Trigger **1 initial send**.
   - Trigger **2–3 resend requests** in short succession.
4. Watch for:
   - "Too many attempts" or "try again later" messages.
   - 429 + Retry-After headers.
   - Sudden CAPTCHAs or extra challenges.

### 3) Password reset & email/phone enumeration throttling

1. Identify reset endpoints: `/forgot`, `/forgot-password`, `/reset`, `/api/auth/reset`, etc.
2. Choose **1 real-looking identity** and **1 clearly fake identity**.
3. For each identity:
   - Send **1 baseline reset request**; record status and body (does it disclose if the account exists?).
   - Send **2–4 additional reset requests** in a short window.
4. Check for:
   - **Per-identity throttling** (existing account throttled, non-existing not throttled).
   - **Enumeration via timing or messaging** (different behavior based on existence).

### 4) API per-endpoint throttling (429 / Retry-After)

1. Choose a **non-destructive API endpoint** (e.g. public search or profile read) that can safely handle a few extra requests.
2. Send a **baseline single request**.
3. Send a **burst of 5–8 requests** with the same parameters from the same IP.
4. Look for:
   - HTTP **429** responses.
   - **Retry-After** header values and their consistency.
   - Any shift in latency or error messages.

### 5) IP-based vs account-based limiting indicators

Where in-scope and safe:

1. For a login or OTP endpoint already tested:
   - Vary **identities with the same IP**:
     - Send a few attempts for identity A, then a few for identity B.
   - Vary **IP (or source) with the same identity** if you legitimately have multiple IPs in-scope (e.g. different proxy nodes):
     - Keep attempts per IP **within the same small caps**.
2. Infer:
   - **Account-based** rate limit: same identity gets blocked independent of IP.
   - **IP-based** rate limit: all identities from a single IP are blocked/throttled together.
3. Stop if you hit lockout or CAPTCHAs during any of these variations.

After each sub-test, call:

- **write_file**(path: `daily/<target>/<YYYY-MM-DD>/rate-limit.log`, mode: append, content: structured log line — see LOG section).

---

## OBSERVE

For each tested endpoint and identity, capture:

- Request **sequence**: timestamps, count, identity, IP (if varied), endpoint, HTTP status.
- Any **change in responses** across the burst:
  - Status transitions (e.g. 200 → 401 → 429).
  - Body changes: "invalid credentials" → "too many attempts" → "account locked".
  - New headers: **Retry-After**, anti-bot headers, or WAF messages.
- Clear signs of:
  - **No effective rate limiting** (all attempts behave identically, no delay or caps).
  - **Weak or mis-scoped limits** (per-IP only, but per-account unlimited via rotation; or per-identity only but easy to bypass).

---

## REFLECT

- Did you stay within **safety caps** (requests per identity, per endpoint, per burst)?
- For each area (login, OTP, reset, API, IP vs account):
  - Is there strong evidence of **missing** or **insufficient** rate limiting?
  - Or does the target show **adequate** protection?
- Are your logs sufficient to:
  - Reconstruct **exact sequences** of requests and responses.
  - Demonstrate why rate limiting is weak or missing (or why it is adequate).
- If evidence is incomplete or ambiguous, **do not report** as confirmed; instead log as "inconclusive" and move on.

---

## LOG

Use **write_file** to keep a structured audit trail under:

- `daily/<target>/<YYYY-MM-DD>/rate-limit.log`

Recommended **log format** per line (JSON or pipe-delimited string), for example:

- JSON-style:
  - `{"area":"login","endpoint":"/login","identity":"test@example.com","ip":"x.x.x.x","burst_size":5,"responses":[401,401,401,401,401],"lockout":false,"captcha":false,"notes":"No visible rate limit"}`
- Pipe-delimited:
  - `rate-limit | area=login | endpoint=/login | identity=test@example.com | ip=x.x.x.x | burst=5 | statuses=401,401,401,401,401 | lockout=false | captcha=false | notes=No visible rate limit`

At minimum, include:

- **area**: login / otp / resend / reset / api / ip-vs-account.
- **endpoint**: path tested.
- **identity** (if applicable): email/username/phone (mask if sensitive).
- **burst_size** and approximate **duration**.
- **statuses** sequence (e.g. `[401,401,429,429]`).
- **lockout/captcha/429-storm** booleans.
- Short **notes** with any anomalies.

Also log a checklist-style summary once done:

- `Checklist progress: Rate-limit — Login:[done]; OTP:[done/skip]; Reset:[done/skip]; API:[done/skip]; IP-vs-account:[done/skip].`

---

## Confirmation Criteria

Confirm a **rate limiting / anti-automation weakness** only when you have:

- A clearly documented **request sequence** (counts and timestamps) showing:
  - Many consecutive sensitive attempts (within safe caps) **without** any limit, lockout, delay, or additional challenge; or
  - Limits that are easy to bypass (e.g. rotate identity/IP and keep attacking a single account).
- Evidence that:
  - **Login/OTP/reset** endpoints allow repeated attempts with no observable control, and
  - This behavior is consistent across at least **one small burst** and a **second confirming burst** (within safety caps), or
  - 429/Retry-After is **inconsistent** or trivially bypassed.
- Clear indication of whether controls are **IP-based**, **account-based**, or missing; and why that matters.

Do **not** confirm based on a single or double request; you need a short, well-documented burst within the safety rules.

---

## report_finding Template

When you confirm a rate limiting or anti-automation issue, call **report_finding** with at least:

- **title**:  
  - `Rate limiting — Weak login throttling on /login`  
  - `Rate limiting — No OTP resend limit on /api/auth/otp/resend`  
  - `Rate limiting — Per-IP only, account not protected`
- **severity**:
  - High: Missing limits on login/OTP/reset that enable practical credential stuffing or takeover (within reasonable assumptions).
  - Medium: Weak or easily bypassed limits (e.g. per-IP only, trivial rotation).
  - Low: Non-auth APIs or minor enumeration throttling gaps.
- **target**: Base URL + endpoint path (e.g. `https://target.com/login`).
- **description**:
  - Context (which endpoint/flow).
  - What limit is missing or weak.
  - Why this matters (attack scenario).
- **poc** (required):
  - A **timeline of requests**: count, approximate timestamps, endpoint, identity/IP, and responses.
  - Example:
    - `t0: POST /login user=test@example.com pass=wrong1 → 401 "Invalid credentials"`
    - `t1..t5: 4 more POST /login with wrong passwords → 401 "Invalid credentials" each, no delay or lockout`
    - `t6..t10: same pattern with second identity; still no lockout/captcha/429`
  - Any 429/Retry-After details if relevant.
- **evidence**:
  - Response snippets (status + key body text) or HAR/screenshot paths.
  - Excerpts from `rate-limit.log` showing the sequence.

Always ensure the **poc** clearly demonstrates both:

- **How many requests** were sent, and
- **What the server did** (or failed to do) in response over time.

