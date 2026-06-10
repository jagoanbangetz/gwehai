/**
 * Modular prompts index — re-exports everything the PromptManager needs.
 */

export { CORE_PROMPT } from './core.prompt';
export {
  PHASE_PROMPTS,
  PHASE_ORDER,
  getPhasePrompt,
  type PentestPhase,
  RECON_PHASE_PROMPT,
  INPUT_HANDLING_PHASE_PROMPT,
  AUTH_PHASE_PROMPT,
  ACCESS_CONTROL_PHASE_PROMPT,
  REPORT_PHASE_PROMPT,
} from './phases/index';
export {
  TOOL_PROMPTS,
  TOOL_TRIGGER_NAMES,
  getToolPrompt,
  getToolPromptsForTools,
  FFUF_TOOL_PROMPT,
  SQLMAP_TOOL_PROMPT,
  NUCLEI_TOOL_PROMPT,
  NIKTO_TOOL_PROMPT,
  CURL_TOOL_PROMPT,
  BROWSER_TOOL_PROMPT,
  SESSIONS_TOOL_PROMPT,
} from './tools/index';
