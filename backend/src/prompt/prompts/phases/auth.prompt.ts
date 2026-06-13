/**
 * Auth Phase Prompt — injected during auth_session checklist section.
 * Covers registration, login, session management, CSRF, password reset.
 */

export const AUTH_PHASE_PROMPT = `## Phase: Authentication & Session Testing

**Load the skill:** memory_get(path: "skills/auth/SKILL.md")

### What to test
- Registration: duplicate accounts, weak passwords, email verification bypass
- Login: brute force, credential stuffing, account lockout
- Session: session fixation, token entropy, cookie flags (HttpOnly, Secure, SameSite)
- CSRF: missing tokens, token reuse, bypass techniques
- Password reset: token predictability, host header injection, race conditions

### Browser-based auth testing
For authenticated scanning, use **browser_action** tool:
- **auto_login**: detect login form, fill credentials, capture auth state
- **test_xss**: test reflected XSS via form inputs
- **check_csrf**: audit CSRF tokens in forms
- **get_auth_state** / **set_auth_state**: persist and reuse auth across requests

### Report findings
Call **report_finding** for each confirmed issue with:
- detail: full description + location + impact
- poc: concrete evidence (request + response showing the bug)
- confidence (0-100) + confidence_reason (min 20 chars)

### After auth_session
Call **update_pentest_phase** with checklist.auth_session=true. Then proceed to access_control.`;
