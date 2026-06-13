/**
 * nikto tool prompt — injected when agent uses nikto for web server scanning.
 */

export const NIKTO_TOOL_PROMPT = `### nikto (web server scanning)
Syntax: \`nikto -h https://TARGET\`
- Use -h with host (no path)
- Good for finding default files, misconfigurations, outdated software`;
