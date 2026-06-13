/**
 * browser_action tool prompt — injected when agent uses Playwright-based browser scanning.
 */

export const BROWSER_TOOL_PROMPT = `### browser_action (authenticated scanning)
**Actions:** navigate, auto_login, click, type, extract, screenshot, analyze, test_xss, check_csrf, get_auth_state, set_auth_state, save_storage_state
- Rate-limited to 1 req/sec
- Use **scope** array to restrict to target domains
- Screenshots auto-captured per step
- For custom browser automation: use **write_script** to create JS under /opt/browser/scripts/, then run with exec: node /opt/browser/scripts/<filename> [args]`;
