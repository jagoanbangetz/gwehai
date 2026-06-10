/**
 * Sessions/sub-agent tool prompt — injected when agent uses multi-agent coordination.
 */

export const SESSIONS_TOOL_PROMPT = `### Sub-agent coordination
- **agents_list**: list allowed agent roles (recon, exploit, general)
- **sessions_spawn**: create sub-agent (role: recon/exploit/general). Returns session_id.
- **sessions_send**: send task to sub-agent. **Always include the actual target URL** in the message (not "TARGET").
  - wait_for_reply: true = block until sub-agent responds
  - wait_for_reply: false = run in background (you continue)
- **sessions_history**: read sub-agent findings
- **sessions_list**: list active sub-agents (parent_id: current)
- Sub-agents appear as [Gweh], [Shadow], [Nexus] in the UI`;
