/**
 * Fun names for AI agents (main agent = 1, sub-agents = 2, 3, ...).
 * Used in SSE events so the UI shows e.g. "Scout", "Shadow", "Nexus" instead of "Agent 1", "Agent 2".
 */
const AGENT_NAMES: string[] = [
  'Gweh',    // Agent 1 – main recon lead
  'Shadow',  // Agent 2
  'Nexus',   // Agent 3
  'Cipher',  // Agent 4
  'Vector',  // Agent 5
  'Phantom', // Agent 6
  'Raven',   // Agent 7
  'Hawk',    // Agent 8
  'Echo',    // Agent 9
  'Pulse',   // Agent 10
];

/**
 * Returns a display name for the agent at the given index (1-based).
 * Falls back to "Agent N" if index is beyond the names list.
 */
export function getAgentLabel(index: number): string {
  const oneBased = Math.max(1, Math.floor(index));
  return AGENT_NAMES[oneBased - 1] ?? `Agent ${oneBased}`;
}
