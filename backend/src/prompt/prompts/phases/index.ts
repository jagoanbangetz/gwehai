/**
 * Phase prompts index — maps phase names to prompt strings.
 */

import { RECON_PHASE_PROMPT } from './recon.prompt';
import { INPUT_HANDLING_PHASE_PROMPT } from './input-handling.prompt';
import { AUTH_PHASE_PROMPT } from './auth.prompt';
import { ACCESS_CONTROL_PHASE_PROMPT } from './access-control.prompt';
import { REPORT_PHASE_PROMPT } from './report.prompt';

/** Pentest phases that map to specific prompt injections. */
export type PentestPhase =
  | 'recon'
  | 'input_handling'
  | 'auth_session'
  | 'access_control'
  | 'business_logic'
  | 'report'
  | 'completed';

/** Maps phase → prompt snippet. Only one phase prompt is active at a time. */
export const PHASE_PROMPTS: Record<string, string> = {
  recon: RECON_PHASE_PROMPT,
  input_handling: INPUT_HANDLING_PHASE_PROMPT,
  auth_session: AUTH_PHASE_PROMPT,
  access_control: ACCESS_CONTROL_PHASE_PROMPT,
  business_logic: ACCESS_CONTROL_PHASE_PROMPT, // shares access control prompt
  report: REPORT_PHASE_PROMPT,
};

/** Phase execution order for checklist flow. */
export const PHASE_ORDER: PentestPhase[] = [
  'recon',
  'input_handling',
  'auth_session',
  'access_control',
  'business_logic',
  'report',
  'completed',
];

/** Get the prompt for a given phase, or undefined if phase is unknown/completed. */
export function getPhasePrompt(phase: string): string | undefined {
  return PHASE_PROMPTS[phase];
}

export {
  RECON_PHASE_PROMPT,
  INPUT_HANDLING_PHASE_PROMPT,
  AUTH_PHASE_PROMPT,
  ACCESS_CONTROL_PHASE_PROMPT,
  REPORT_PHASE_PROMPT,
};
