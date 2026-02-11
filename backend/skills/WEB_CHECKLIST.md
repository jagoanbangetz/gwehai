# Web Pentest Checklist

Use this checklist for **full** web application assessments. Reference: [Pentesting Web checklist](https://www.pentest-book.com/others/web-checklist). **Do not stop after one finding** — work through each phase and only conclude when you have covered the checklist or are confident all test areas are done. Track progress in conversation memory (write_file → main or **daily/website/YYYY-MM-DD**, e.g. daily/testphp.vulnweb.com/2026-02-10) with a "Checklist progress" section.

---

## 1. Recon (small/medium scope)

- [ ] Identify web server, technologies, database (curl -I, curl -s; check Server, X-Powered-By)
- [ ] Locate /robots.txt, /sitemap.xml, /.well-known/
- [ ] Directory/path enumeration (exec: dirsearch, or craft_payload with curl loop)
- [ ] Web fuzzing (exec: wfuzz or craft_payload)
- [ ] Identify WAF if present (curl headers, error responses)
- [ ] Check security headers (X-Frame-Options, CSP, HSTS, etc. via curl -I)
- [ ] Document tech stack and paths in memory (write_file)

---

## 2. Input handling & injection

- [ ] Fuzz parameters (exec: wfuzz; craft_payload for small curl loops)
- [ ] SQL injection: test parameters with ' and --+- ; verify with **exec: sqlmap -u "URL" --level=1 --risk=1 --batch**; **report_finding** when confirmed
- [ ] Reflected XSS: test inputs with script payloads (curl or craft_payload); report_finding when confirmed
- [ ] Stored XSS: test name/email/comment fields; report_finding when confirmed
- [ ] Path traversal / LFI: test file parameters (e.g. ?file=../../../etc/passwd)
- [ ] Command injection: test inputs that might be passed to shell
- [ ] Open redirect: test redirect/url/next parameters
- [ ] HTTP header injection (X-Forwarded-Host, etc.)
- [ ] XXE if XML endpoints (content-type application/xml)
- [ ] NoSQL injection if applicable
- Document each tested area in memory; **report_finding** for every confirmed vuln

---

## 3. Authentication & session

- [ ] Registration: duplicate registration, weak password policy, email verification bypass
- [ ] Login: username enumeration, SQLi in login (sqlmap), default creds
- [ ] Session: token predictability, cookie flags (HttpOnly, Secure), session fixation
- [ ] CSRF on state-changing actions (if you can craft requests)
- [ ] Password reset: token leakage, idor in reset link, host header injection
- **report_finding** for each confirmed auth/session issue

---

## 4. Access control & logic

- [ ] IDOR: tamper user/id parameters to access other users' data
- [ ] Privilege escalation: access admin functions with low-priv cookie
- [ ] Parameter tampering: price, quantity, discount codes (if e‑commerce)
- [ ] Multi-step process logic flaws
- **report_finding** for each confirmed access control or logic flaw

---

## 5. Other

- [ ] Dangerous HTTP methods (OPTIONS, PUT, DELETE via curl -X)
- [ ] Security headers (missing or weak CSP, X-Frame-Options, etc.)
- [ ] Information disclosure (stack traces, verbose errors)
- [ ] CAPTCHA bypass (if present): replay old value, remove param

---

## Rules

1. **Do not stop after one bug.** After reporting a finding, continue to the next checklist section. Only conclude when you have covered the checklist or scope/time is exhausted.
2. **report_finding** for every confirmed vulnerability before moving on.
3. **write_file** (path: main or **daily/website/YYYY-MM-DD**, e.g. daily/target.com/2026-02-10) to track "Checklist progress" and tested areas so you don’t repeat or skip.
4. Respect SCOPE.md; only test in-scope targets. If a tool is missing, use craft_payload with curl to test common paths or ask the user for a wordlist path.
