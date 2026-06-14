/**
 * sslyze tool prompt — injected when agent uses sslyze for SSL/TLS analysis.
 */

export const SSLYZE_TOOL_PROMPT = `### sslyze (SSL/TLS analysis)
Syntax: \`sslyze --json TARGET\` — outputs JSON to stdout
Common flags:
- \`--json\` — JSON output (NOT \`-json\`, single dash is WRONG)
- \`--certinfo\` — certificate information
- \`--heartbleed\` — Heartbleed vulnerability check
- \`--targets_in FILE\` — read targets from file
Example: \`sslyze --json --certinfo https://example.com\`
IMPORTANT: sslyze uses DOUBLE DASH (--) for long flags. \`-json\` will fail with "flag provided but not defined".`;
