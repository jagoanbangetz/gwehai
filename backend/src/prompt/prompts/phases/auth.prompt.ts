/**
 * Auth Phase Prompt — injected during auth_session checklist section.
 * Covers registration, login, session management, CSRF, password reset.
 */

export const AUTH_PHASE_PROMPT = `## Phase: Authentication & Session Testing

**Load skill:** memory_get(path: "skills/auth/SKILL.md")

### WHAT YOU MUST TEST
- Registration: duplicate accounts, weak passwords, email verification bypass
- Login: brute force, credential stuffing, account lockout
- Session: session fixation, token entropy, cookie flags (HttpOnly, Secure, SameSite)
- CSRF: missing tokens, token reuse, bypass techniques
- Password reset: token predictability, host header injection, race conditions

### REPORT FINDINGS IMMEDIATELY
Call **report_finding** for EACH confirmed issue. Do NOT batch multiple findings. Every finding must have:
- detail: description + location + impact
- poc: concrete evidence (actual request + response showing the bug)
- confidence (0-100) + confidence_reason (min 20 chars)

### AFTER AUTH
Call **update_pentest_phase** with checklist.auth_session=true. IMMEDIATELY proceed to access_control.`;
