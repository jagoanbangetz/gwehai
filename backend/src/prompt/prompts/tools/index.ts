/**
 * Tool prompts index — maps tool names to prompt strings.
 */

import { FFUF_TOOL_PROMPT } from './ffuf.prompt';
import { SQLMAP_TOOL_PROMPT } from './sqlmap.prompt';
import { NUCLEI_TOOL_PROMPT } from './nuclei.prompt';
import { NIKTO_TOOL_PROMPT } from './nikto.prompt';
import { CURL_TOOL_PROMPT } from './curl.prompt';
import { BROWSER_TOOL_PROMPT } from './browser.prompt';
import { SESSIONS_TOOL_PROMPT } from './sessions.prompt';
import { REPORT_FINDING_TOOL_PROMPT } from './report-finding.prompt';
import { SSLYZE_TOOL_PROMPT } from './sslyze.prompt';

/** Maps tool name → prompt snippet. Injected only when the tool is called. */
export const TOOL_PROMPTS: Record<string, string> = {
  ffuf: FFUF_TOOL_PROMPT,
  sqlmap: SQLMAP_TOOL_PROMPT,
  nuclei: NUCLEI_TOOL_PROMPT,
  nikto: NIKTO_TOOL_PROMPT,
  curl: CURL_TOOL_PROMPT,
  browser_action: BROWSER_TOOL_PROMPT,
  sessions_spawn: SESSIONS_TOOL_PROMPT,
  sessions_send: SESSIONS_TOOL_PROMPT,
  sessions_history: SESSIONS_TOOL_PROMPT,
  sessions_list: SESSIONS_TOOL_PROMPT,
  report_finding: REPORT_FINDING_TOOL_PROMPT,
  sslyze: SSLYZE_TOOL_PROMPT,
};

/** Tool names that trigger tool-specific prompt injection. */
export const TOOL_TRIGGER_NAMES = Object.keys(TOOL_PROMPTS);

/** Get tool prompt for a given tool name, or undefined if no specific prompt exists. */
export function getToolPrompt(toolName: string): string | undefined {
  return TOOL_PROMPTS[toolName];
}

/**
 * Get combined tool prompts for a set of tool names (deduped).
 * Sessions tools share one prompt, so we dedupe by prompt content.
 */
export function getToolPromptsForTools(toolNames: string[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const name of toolNames) {
    const prompt = TOOL_PROMPTS[name];
    if (prompt && !seen.has(prompt)) {
      seen.add(prompt);
      parts.push(prompt);
    }
  }
  return parts.join('\n\n');
}

export {
  FFUF_TOOL_PROMPT,
  SQLMAP_TOOL_PROMPT,
  NUCLEI_TOOL_PROMPT,
  NIKTO_TOOL_PROMPT,
  CURL_TOOL_PROMPT,
  BROWSER_TOOL_PROMPT,
  SESSIONS_TOOL_PROMPT,
  REPORT_FINDING_TOOL_PROMPT,
  SSLYZE_TOOL_PROMPT,
};
