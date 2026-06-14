/**
 * Tool Executor Service
 * 
 * Handles tool execution dispatch — the massive switch statement from ChatService.
 * Each tool has its own handler method for clean separation.
 * Extracted from ChatService for single-responsibility and testability.
 */

import { Injectable } from '@nestjs/common';
import { ToolsService } from '../tools/tools.service';
import { ToolAvailabilityService } from '../tools/tool-availability.service';
import { ReportsService } from '../reports/reports.service';
import { ReVerifyService } from '../reports/re-verify.service';
import { HacktivityService } from '../hacktivity/hacktivity.service';
import { PentestJobsService } from '../pentest-jobs/pentest-jobs.service';
import { ConversationService } from './conversation.service';
import { AttackChainService } from '../attack-chain/attack-chain.service';
import { JwtAnalyzerService } from '../tools/jwt-analyzer.service';
import { BrowserAgentService, BrowserLaunchError } from '../browser-agent/browser-agent.service';
import { ResearchBrowserService } from '../research-browser/research-browser.service';
import { GlobalMemoryService } from '../tools/global-memory.service';
import { OobDetectorService } from '../tools/oob-detector.service';
import { WebSearchService } from '../tools/web-search.service';
import { stripAnsi } from '../utils/ansi.util';
import { OobPayloadType } from '../entities/oob-log.entity';
import { getAgentLabel } from './agent-names';
import type { ModelOptionKey } from '../config/model-options.config';

/** Allowed agent roles for sessions_spawn. */
export const ALLOWED_AGENT_ROLES = ['recon', 'exploit', 'general'] as const;

export interface ToolExecutionContext {
  jobId: string;
  conversationId?: string;
  userId?: string;
  memoryScopeId: string;
  nextAgentIndexRef: { current: number };
  pushEvent: (ev: { type: string; data: Record<string, any> }) => void;
  abortSignal?: AbortSignal;
  modelKey?: ModelOptionKey;
  maxAgentsForRun?: number;
}

@Injectable()
export class ToolExecutorService {
  constructor(
    private toolsService: ToolsService,
    private toolAvailability: ToolAvailabilityService,
    private jwtAnalyzer: JwtAnalyzerService,
    private reportsService: ReportsService,
    private reVerifyService: ReVerifyService,
    private hacktivityService: HacktivityService,
    private pentestJobs: PentestJobsService,
    private conversationService: ConversationService,
    private attackChainService: AttackChainService,
    private browserAgentService: BrowserAgentService,
    private researchBrowserService: ResearchBrowserService,
    private globalMemoryService: GlobalMemoryService,
    private oobDetectorService: OobDetectorService,
    private webSearchService: WebSearchService,
  ) {}

  /**
   * Run a tool by name with the given arguments.
   * Returns the tool result as a JSON string.
   */
  async runTool(
    name: string,
    args: Record<string, any>,
    context: ToolExecutionContext,
  ): Promise<string> {
    if (context.abortSignal?.aborted) {
      return JSON.stringify({ error: 'Job stopped by user' });
    }
    const safeArgs = args ?? {};
    const scopeId = context.memoryScopeId;

    switch (name) {
      case 'memory_search':
        return this.handleMemorySearch(safeArgs, scopeId);
      case 'memory_get':
        return this.handleMemoryGet(safeArgs, scopeId);
      case 'write_file':
        return this.handleWriteFile(safeArgs, scopeId);
      case 'write_script':
        return this.handleWriteScript(safeArgs);
      case 'exec':
        return this.handleExec(safeArgs);
      case 'craft_payload':
        return this.handleCraftPayload(safeArgs);
      case 'report_finding':
        return this.handleReportFinding(safeArgs, context);
      case 'jwt_analyze':
        return this.handleJwtAnalyze(safeArgs);
      case 'create_pentest_plan':
        return 'Creating pentest plan...';
      case 'update_pentest_phase':
        return this.handleUpdatePentestPhase(safeArgs, context);
      case 're_verify_findings':
        return this.handleReVerifyFindings(safeArgs, context);
      case 'add_skill':
        return this.handleAddSkill(safeArgs);
      case 'download_skill':
        return this.handleDownloadSkill(safeArgs);
      case 'download_agent':
        return this.handleDownloadAgent();
      case 'git_search':
        return this.handleGitSearch(safeArgs);
      case 'agents_list':
        return this.handleAgentsList();
      case 'sessions_list':
        return this.handleSessionsList(safeArgs, context);
      case 'sessions_history':
        return this.handleSessionsHistory(safeArgs, context);
      case 'sessions_send':
        return this.handleSessionsSend(safeArgs, context);
      case 'sessions_spawn':
        return this.handleSessionsSpawn(safeArgs, context);
      case 'session_status':
        return this.handleSessionStatus(safeArgs, context);
      case 'attack_chain':
        return this.handleAttackChain(safeArgs);
      case 'browser_action':
        return this.handleBrowserAction(safeArgs, context);
      case 'global_memory':
        return this.handleGlobalMemory(safeArgs);
      case 'oob_test':
        return this.handleOobTest(safeArgs);
      case 'research_browse':
        return this.handleResearchBrowse(safeArgs, context);
      case 'research_search':
        return this.handleResearchSearch(safeArgs, context);
      case 'web_search':
        return this.handleWebSearch(safeArgs, context);
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  }

  // ─── Individual Tool Handlers ───────────────────────────────────────────

  private async handleMemorySearch(args: Record<string, any>, scopeId: string): Promise<string> {
    const results = await this.toolsService.memorySearch(
      String(args.query || ''),
      Number(args.max_results) || 10,
      scopeId,
    );
    const payload: { results: any[]; hint?: string } = { results };
    if (results.length === 0) {
      payload.hint = 'No notes yet for this conversation. Use write_file (path: main or daily/website/YYYY-MM-DD, append: true) to save notes.';
    }
    return JSON.stringify(payload, null, 2);
  }

  private async handleMemoryGet(args: Record<string, any>, scopeId: string): Promise<string> {
    const text = await this.toolsService.memoryGet(
      String(args.path || ''),
      args.from != null ? Number(args.from) : undefined,
      args.lines != null ? Number(args.lines) : undefined,
      scopeId,
    );
    if (!text || !text.trim()) {
      return '(empty) No content for this path yet. Use write_file (path: main or daily/website/YYYY-MM-DD, append: true) to save notes.';
    }
    return text;
  }

  private async handleWriteFile(args: Record<string, any>, scopeId: string): Promise<string> {
    const out = await this.toolsService.writeFile(
      String(args.path || ''),
      String(args.content || ''),
      Boolean(args.append),
      scopeId,
    );
    return JSON.stringify(out);
  }

  private async handleWriteScript(args: Record<string, any>): Promise<string> {
    const out = await this.toolsService.writeScript(
      String(args.filename || '').trim(),
      String(args.content || ''),
    );
    return JSON.stringify(out);
  }

  private async handleExec(args: Record<string, any>): Promise<string> {
    const cmdLine = String(args.command || '').trim();
    if (!cmdLine) {
      // LAYER 2: Return plain-text error (NOT JSON) for consistent noise filtering.
      // The '{ skipped: true }' flag in JSON form is also returned for programmatic consumers.
      return JSON.stringify({ error: 'Error: exec requires a non-empty command. Provide a valid command (e.g. "curl -I https://target.com", "nmap -sV target.com").', skipped: true });
    }
    const parts = cmdLine.split(/\s+/).filter(Boolean);
    const command = parts[0] || '';
    if (!command) {
      return JSON.stringify({ error: 'Error: exec requires a non-empty command. Provide a valid command.', skipped: true });
    }

    // ── Tool availability pre-check ────────────────────────────────────
    // Before executing, verify the tool is actually installed in the container.
    // Prevents wasted exec calls and noisy "command not found" errors.
    try {
      const isAvailable = await this.toolAvailability.isToolAvailable(command);
      if (!isAvailable) {
        const available = await this.toolAvailability.getAvailableToolNames();
        // Find similar tools for suggestions
        const suggestions = available.filter((t) =>
          t.startsWith(command[0]) || command.includes(t) || t.includes(command),
        ).slice(0, 3);
        const suggestMsg = suggestions.length > 0
          ? ` Did you mean: ${suggestions.join(', ')}?`
          : '';
        return JSON.stringify({
          error: `Tool '${command}' is not available in the pentest environment.${suggestMsg} Use GET /tools/available to see the full list.`,
          exitCode: 1,
          tool_available: false,
          suggestions,
        });
      }
    } catch {
      // If availability check fails (e.g. container down), proceed with exec
      // and let the normal error handling catch it.
    }

    const cmdArgs = parts.slice(1);
    const target = args.target != null ? String(args.target) : undefined;
    const out = await this.toolsService.execCommand({
      command,
      args: cmdArgs.length ? cmdArgs : undefined,
      commandLine: cmdLine,
      target,
    });
    return JSON.stringify({ stdout: out.stdout, stderr: out.stderr, exitCode: out.exitCode });
  }

  private async handleCraftPayload(args: Record<string, any>): Promise<string> {
    const script = String(args.script ?? '').trim();
    if (!script) {
      return JSON.stringify({ error: 'craft_payload requires script (e.g. bash or python3 -c "...")' });
    }
    const out = await this.toolsService.runPayloadScript(script);
    return JSON.stringify({ stdout: out.stdout, stderr: out.stderr, exitCode: out.exitCode });
  }

  private async handleReportFinding(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    if (!context.userId || !context.conversationId) {
      return JSON.stringify({ error: 'report_finding requires an active conversation' });
    }
    const detail = String(args.detail ?? '').trim();
    if (!detail) {
      return JSON.stringify({ error: 'report_finding requires detail (description of the bug/finding)' });
    }

    // --- Confidence validation ---
    const rawConfidence = args.confidence;
    if (rawConfidence == null || rawConfidence === '') {
      return JSON.stringify({ error: 'report_finding requires confidence (0-100). Provide a number indicating how sure you are this finding is real.' });
    }
    const confidence = Number(rawConfidence);
    if (isNaN(confidence) || confidence < 0 || confidence > 100 || !Number.isInteger(confidence)) {
      return JSON.stringify({ error: 'report_finding confidence must be an integer between 0 and 100.' });
    }

    const confidenceReason = String(args.confidence_reason ?? '').trim();
    if (!confidenceReason) {
      return JSON.stringify({ error: 'report_finding requires confidence_reason — explain why you gave this confidence score.' });
    }
    if (confidenceReason.length < 10) {
      return JSON.stringify({ error: `report_finding confidence_reason must be at least 10 characters (got ${confidenceReason.length}). Explain what evidence supports or weakens the finding.` });
    }

    // --- Tool Evidence Gate ---
    // BLOCK fake findings: every report_finding MUST be backed by real tool execution
    // in the same conversation. Check hacktivity for evidence-producing tool calls.
    const evidenceCount = await this.hacktivityService.countEvidenceToolCalls(
      context.userId,
      context.conversationId,
    );
    if (evidenceCount === 0 && !context.jobId) {
      return JSON.stringify({
        error: 'report_finding BLOCKED: No tool execution evidence found in this conversation. You MUST run at least one tool (exec, craft_payload, browser_action, research_browse, etc.) before reporting a finding. Every finding must be backed by real tool output — no fabricated findings allowed.',
        hint: 'Run exec, craft_payload, or browser_action to gather real evidence first, then call report_finding with the actual tool output as proof.',
      });
    }

    // Anti-hallucination gate: low confidence + weak evidence → block and ask to verify
    if (confidence < 50) {
      const detailLower = detail.toLowerCase();
      const hasStrongSignal = /sqlmap|nuclei|nikto|confirmed|verified|exploited|dumped|injected|executed|bypassed/.test(detailLower);
      const pocLower = String(args.poc ?? '').toLowerCase();
      const hasPocEvidence = pocLower.length > 50 && /(response|output|result|payload|evidence|proof|snippet)/.test(pocLower);
      if (!hasStrongSignal && !hasPocEvidence) {
        return JSON.stringify({
          error: 'report_finding BLOCKED: confidence < 50 with weak evidence. Verify the finding again before reporting. Run additional tools (sqlmap, curl, nuclei, etc.) to confirm, or increase confidence with stronger evidence.',
          confidence,
          confidence_reason: confidenceReason,
          hint: 'Either re-run verification tools and report with stronger evidence, or if this is genuinely uncertain, mark confidence 0 with a clear reason why it needs manual review.',
        });
      }
    }

    // Confidence label for metadata
    const confidenceLabel = confidence >= 80 ? 'high' : confidence >= 50 ? 'medium' : 'low';

    // Auto-fill target from pentest job if LLM didn't provide it
    let reportTarget = args.target ? String(args.target) : undefined;
    if (!reportTarget && context.jobId) {
      try {
        const job = await this.pentestJobs.findOne(context.userId, context.jobId);
        reportTarget = job?.targetBaseUrl || undefined;
      } catch { /* ignore */ }
    }

    const report = await this.reportsService.createFinding(context.userId, context.conversationId, detail, {
      title: args.title ? String(args.title) : undefined,
      severity: args.severity ? String(args.severity) : undefined,
      target: reportTarget,
      poc: args.poc ? String(args.poc) : undefined,
      finding_key: args.finding_key ? String(args.finding_key) : undefined,
      confidence,
      confidence_reason: confidenceReason,
      confidence_label: confidenceLabel,
    });

    // Bridge: also save to pentest_findings table when running inside a pentest job
    // This ensures the pentest job's findingCount in getSummary() reflects actual findings
    if (context.jobId) {
      try {
        await this.pentestJobs.createPentestFinding(context.jobId, {
          title: args.title ? String(args.title) : (detail.substring(0, 200) || undefined),
          severity: args.severity ? String(args.severity) : undefined,
          poc: args.poc ? String(args.poc) : undefined,
          evidenceJson: {
            detail,
            target: args.target ? String(args.target) : undefined,
            finding_key: args.finding_key ? String(args.finding_key) : undefined,
            confidence_label: confidenceLabel,
          },
          confidence,
          confidenceReason,
        });
      } catch {
        // Non-blocking: pentest_findings bridge is best-effort
      }
    }

    // Auto-learning: save successful payload to GlobalMemory when confidence >= 80
    if (confidence >= 80) {
      try {
        const vulnType = args.severity ? String(args.severity).toLowerCase() : 'unknown';
        const detailLower = detail.toLowerCase();
        // Extract vuln type from detail text
        const vulnMatch = detailLower.match(/(sqli|sql.?injection|xss|csrf|idor|ssrf|xxe|rce|lfi|rfi|open.?redirect|auth.?bypass|privilege.?escalation)/);
        const detectedVuln = vulnMatch ? vulnMatch[1].replace(/\s+/g, '_') : vulnType;
        const pocStr = args.poc ? String(args.poc) : '';
        const payloadMatch = pocStr.match(/(?:payload|inject|send|curl|request)[:\s]*[`"']?([^`"'\n]{10,200})/i);
        const extractedPayload = payloadMatch ? payloadMatch[1].trim() : pocStr.substring(0, 200);

        await this.globalMemoryService.autoSavePayload({
          vulnType: detectedVuln,
          payload: extractedPayload,
          context: {
            detail: detail.substring(0, 500),
            target: args.target ? String(args.target) : undefined,
            poc: pocStr.substring(0, 500),
            findingKey: args.finding_key ? String(args.finding_key) : undefined,
          },
          confidence,
        });
      } catch {
        // Silent fail — auto-learning is best-effort, shouldn't break report_finding
      }
    }

    return JSON.stringify({ ok: true, report_id: report.id, confidence, confidence_label: confidenceLabel, message: 'Finding saved to database' });
  }

  private async handleJwtAnalyze(args: Record<string, any>): Promise<string> {
    const token = String(args.token ?? '').trim();
    if (!token) {
      return JSON.stringify({ error: 'jwt_analyze requires a JWT token string' });
    }
    try {
      const result = await this.jwtAnalyzer.analyze(token);
      return JSON.stringify(result, null, 2);
    } catch (err: any) {
      return JSON.stringify({ error: `JWT analysis failed: ${err?.message || String(err)}` });
    }
  }

  private async handleCreatePentestPlan(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    if (!context.userId || !context.conversationId) {
      return JSON.stringify({ error: "create_pentest_plan requires an active conversation" });
    }
    const phasesJsonStr = String(args.phases_json ?? "").trim();
    let phases: any[] = [];

    if (phasesJsonStr) {
      try {
        const parsed = JSON.parse(phasesJsonStr);
        if (Array.isArray(parsed)) phases = parsed;
        else if (parsed.phases && Array.isArray(parsed.phases)) phases = parsed.phases;
      } catch { /* fall through */ }
    }

    if (!phases.length) {
      console.log("[CreatePlan] Empty phases - auto-generating default plan");
      phases = [
        { name: "recon", steps: [
          { id: "recon_step_0", description: "Check HTTP response headers", tool: "exec", command: "curl -sI TARGET", expect: "HTTP headers" },
          { id: "recon_step_1", description: "Discover endpoints with ffuf", tool: "exec", command: "ffuf -u TARGET/FUZZ -w /opt/wordlists/common.txt -mc 200,301,302 -fc 404", expect: "Found paths" },
          { id: "recon_step_2", description: "Check robots.txt", tool: "exec", command: "curl -s TARGET/robots.txt", expect: "Disallow paths or 404" },
        ]},
        { name: "input_handling", steps: [
          { id: "input_handling_step_0", description: "SQL injection test on query params", tool: "exec", command: 'sqlmap -u TARGET?q=test --level=1 --risk=1 --batch', expect: "SQL error or clean" },
          { id: "input_handling_step_1", description: "XSS reflected test", tool: "exec", command: 'curl -s TARGET?q=<script>alert(1)</script> | grep -i script', expect: "Script reflected or clean" },
          { id: "input_handling_step_2", description: "LFI path traversal test", tool: "exec", command: "curl -s TARGET?file=../../etc/passwd", expect: "File contents or error" },
          { id: "input_handling_step_3", description: "Command injection test", tool: "exec", command: "curl -s TARGET?cmd=id", expect: "Command output or error" },
        ]},
        { name: "auth_session", steps: [
          { id: "auth_session_step_0", description: "Check for login endpoints", tool: "exec", command: "curl -sI TARGET/login", expect: "Login page or 404" },
          { id: "auth_session_step_1", description: "Test default credentials", tool: "exec", command: 'curl -s -X POST TARGET/login -d username=admin&password=admin', expect: "Auth response" },
        ]},
        { name: "access_control", steps: [
          { id: "access_control_step_0", description: "IDOR test on user IDs", tool: "exec", command: "curl -s TARGET/user/1", expect: "User data or redirect" },
          { id: "access_control_step_1", description: "Check for admin panels", tool: "exec", command: "curl -sI TARGET/admin", expect: "Admin page or 403" },
        ]},
        { name: "business_logic", steps: [
          { id: "business_logic_step_0", description: "Check for exposed debug endpoints", tool: "exec", command: "curl -s TARGET/debug", expect: "Debug info or 404" },
        ]},
        { name: "other", steps: [
          { id: "other_step_0", description: "Check security headers", tool: "exec", command: "curl -sI TARGET | grep -iE x-frame|x-content|csp|hsts", expect: "Headers or missing" },
          { id: "other_step_1", description: "Check CORS configuration", tool: "exec", command: 'curl -s -H Origin: https://evil.com TARGET -I | grep -i access-control', expect: "CORS headers" },
        ]},
      ];
    }

    let stepIdx = 0;
    const totalSteps = phases.reduce((sum: number, p: any) => sum + (p.steps ? p.steps.length : 0), 0);
    for (const phase of phases) {
      for (const step of (phase.steps || [])) {
        if (!step.id) step.id = phase.name + "_step_" + stepIdx;
        step.status = "pending";
        step.result = null;
        step.executed_at = null;
        stepIdx++;
      }
    }

    const plan = {
      phases,
      total_steps: totalSteps,
      current_step: 0,
      current_phase: 0,
      created_at: new Date().toISOString(),
      target_summary: String(args.target_summary ?? "").trim(),
    };

    const convId = String(args.conversation_id ?? context.conversationId).trim();
    await this.pentestJobs.updateStateByConversationId(context.userId, convId, {
      plan,
      plan_active: true,
    });

    const firstDesc = (phases[0] && phases[0].steps && phases[0].steps[0]) ? phases[0].steps[0].description : "recon";
    return JSON.stringify({
      ok: true,
      message: "Plan created with " + phases.length + " phases, " + totalSteps + " total steps. Start with step 0: " + firstDesc,
      phases: phases.length,
      total_steps: totalSteps,
    });
  }

  private async handleUpdatePentestPhase(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    if (!context.userId || !context.conversationId) {
      return JSON.stringify({ error: 'update_pentest_phase requires an active conversation' });
    }
    const convId = String(args.conversation_id ?? context.conversationId).trim();
    if (!convId) {
      return JSON.stringify({ error: 'conversation_id is required' });
    }
    await this.pentestJobs.updateStateByConversationId(context.userId, convId, {
      phase: args.phase != null ? String(args.phase) : undefined,
      checklist: args.checklist && typeof args.checklist === 'object' ? args.checklist as Record<string, boolean> : undefined,
      last_action_summary: args.last_action_summary != null ? String(args.last_action_summary) : undefined,
    });
    return JSON.stringify({ ok: true, message: 'Pentest phase updated' });
  }

  private async handleReVerifyFindings(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    if (!context.userId || !context.conversationId) {
      return JSON.stringify({ error: 're_verify_findings requires an active conversation' });
    }
    const convId = String(args.conversation_id ?? context.conversationId).trim();
    if (!convId) {
      return JSON.stringify({ error: 'conversation_id is required' });
    }
    const result = await this.reVerifyService.reVerifyAllHighCritical(context.userId, convId);
    return JSON.stringify({
      ok: true,
      message: `Re-verification complete: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped, ${result.disputed} disputed out of ${result.total} HIGH/CRITICAL findings`,
      ...result,
    });
  }

  private async handleAddSkill(args: Record<string, any>): Promise<string> {
    const name = String(args.name ?? '').trim();
    const content = String(args.content ?? '').trim();
    const description = args.description != null ? String(args.description) : undefined;
    const out = await this.toolsService.addSkill(name, content, description);
    return JSON.stringify(out);
  }

  private async handleDownloadSkill(args: Record<string, any>): Promise<string> {
    const skillPath = args.path != null ? String(args.path).trim() : '';
    if (!skillPath) {
      const list = await this.toolsService.listSkills();
      return JSON.stringify(list);
    }
    const out = await this.toolsService.downloadSkill(skillPath);
    return JSON.stringify(out);
  }

  private handleDownloadAgent(): string {
    const roles = [...ALLOWED_AGENT_ROLES];
    const agentLabels: Record<number, string> = {};
    for (let i = 1; i <= 10; i++) {
      agentLabels[i] = getAgentLabel(i);
    }
    return JSON.stringify({
      roles,
      agent_labels: agentLabels,
      hint: 'Use sessions_spawn with role to create a sub-agent (recon, exploit, general).',
    });
  }

  private async handleGitSearch(args: Record<string, any>): Promise<string> {
    const query = String(args.query ?? '').trim();
    const apiUrl = args.api_url != null ? String(args.api_url) : undefined;
    const out = await this.toolsService.gitSearch(query, apiUrl);
    return JSON.stringify(out);
  }

  private handleAgentsList(): string {
    const roles = [...ALLOWED_AGENT_ROLES];
    return JSON.stringify({ roles, hint: 'Use sessions_spawn with role to create a sub-agent (recon, exploit, general).' });
  }

  private async handleSessionsList(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    if (!context.userId) return JSON.stringify({ error: 'sessions_list requires an active user' });
    const list = await this.conversationService.listSessions(context.userId, {
      parent_id: args.parent_id ? String(args.parent_id) : undefined,
      role: args.role ? String(args.role) : undefined,
      last: args.last != null ? Number(args.last) : undefined,
    });
    return JSON.stringify({ sessions: list });
  }

  private async handleSessionsHistory(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    const sessionId = String(args.session_id ?? '').trim();
    if (!sessionId) return JSON.stringify({ error: 'sessions_history requires session_id' });
    if (!context.userId) return JSON.stringify({ error: 'sessions_history requires an active user' });
    const history = await this.conversationService.getSessionHistory(context.userId, sessionId, args.last != null ? Number(args.last) : 50);
    return JSON.stringify({ session_id: sessionId, messages: history });
  }

  private async handleSessionsSend(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    const sessionId = String(args.session_id ?? '').trim();
    const msg = String(args.message ?? '').trim();
    if (!sessionId || !msg) return JSON.stringify({ error: 'sessions_send requires session_id and message' });
    if (!context.userId || !context.conversationId) return JSON.stringify({ error: 'sessions_send requires an active conversation' });
    
    const waitForReply = args.wait_for_reply !== false;
    const subIndex = context.nextAgentIndexRef ? context.nextAgentIndexRef.current++ : 2;
    const subLabel = getAgentLabel(subIndex);
    
    // This delegates back to the agent orchestrator — we import it lazily to avoid circular deps
    // The actual sendToSession logic will be handled by AgentOrchestratorService
    return JSON.stringify({
      _delegate: 'sessions_send',
      sessionId,
      message: msg,
      waitForReply,
      subIndex,
      subLabel,
    });
  }

  private async handleSessionsSpawn(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    if (!context.userId || !context.conversationId) return JSON.stringify({ error: 'sessions_spawn requires an active conversation' });
    
    const result = await this.conversationService.spawnSession(
      context.userId,
      context.conversationId,
      args.role ? String(args.role) : undefined,
      args.title ? String(args.title) : undefined,
      ALLOWED_AGENT_ROLES,
    );
    return JSON.stringify(result);
  }

  private async handleSessionStatus(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    const sessionId = (args.session_id ?? context.conversationId) ?? '';
    if (!sessionId) return JSON.stringify({ error: 'session_status requires session_id (or current conversation)' });
    if (!context.userId) return JSON.stringify({ error: 'session_status requires an active user' });
    const status = await this.conversationService.getSessionStatus(context.userId, sessionId);
    return JSON.stringify(status);
  }

  private async handleAttackChain(args: Record<string, any>): Promise<string> {
    // If list_chains is true, just return available chains
    if (args.list_chains === true) {
      return JSON.stringify({
        chains: this.attackChainService.listChains(),
        safety: {
          max_steps: 10,
          rate_limit_ms: 500,
          max_duration_ms: 120000,
        },
      });
    }

    const targetUrl = String(args.target_url ?? '').trim();
    if (!targetUrl) {
      return JSON.stringify({ error: 'attack_chain requires target_url' });
    }

    const chainName = args.chain_name ? String(args.chain_name) : undefined;
    const steps = Array.isArray(args.steps) ? args.steps : undefined;

    if (!chainName && (!steps || steps.length === 0)) {
      return JSON.stringify({
        error: 'attack_chain requires either chain_name (built-in) or steps (custom). Set list_chains=true to see available chains.',
      });
    }

    const result = await this.attackChainService.runChain({
      chainName,
      steps,
      targetUrl,
      variables: args.variables && typeof args.variables === 'object' ? args.variables : undefined,
      approval: args.approval === true,
      defaultHeaders: args.default_headers && typeof args.default_headers === 'object' ? args.default_headers : undefined,
      maxSteps: args.max_steps != null ? Number(args.max_steps) : undefined,
    });

    return JSON.stringify(result);
  }

  private async handleBrowserAction(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    const action = String(args.action ?? '').trim();
    if (!action) {
      return JSON.stringify({ error: 'browser_action requires action (navigate, auto_login, click, type, extract, screenshot, analyze, test_xss, check_csrf, get_auth_state, set_auth_state, save_storage_state)' });
    }

    const conversationId = context.conversationId || context.jobId;
    if (!conversationId) {
      return JSON.stringify({ error: 'browser_action requires an active conversation' });
    }

    const opts = args.options && typeof args.options === 'object' ? args.options : {};
    const scope: string[] = Array.isArray(args.scope) ? args.scope : [];

    try {
      let result: any;
      switch (action) {
        case 'navigate':
          result = await this.browserAgentService.navigate(conversationId, String(args.url ?? ''), {
            scope,
            waitForSelector: opts.waitForSelector,
            timeout: opts.timeout,
          });
          break;
        case 'auto_login':
          result = await this.browserAgentService.autoLogin(
            conversationId,
            String(args.url ?? ''),
            String(args.username ?? ''),
            String(args.value ?? ''),
            {
              scope,
              usernameSelector: opts.usernameSelector,
              passwordSelector: opts.passwordSelector,
              submitSelector: opts.submitSelector,
            },
          );
          break;
        case 'click':
          result = await this.browserAgentService.click(conversationId, String(args.selector ?? ''), {
            scope,
            waitForNavigation: opts.waitForNavigation,
          });
          break;
        case 'type':
          result = await this.browserAgentService.type(
            conversationId,
            String(args.selector ?? ''),
            String(args.value ?? ''),
            { scope, delay: opts.delay, clear: opts.clear },
          );
          break;
        case 'extract':
          result = await this.browserAgentService.extract(conversationId, {
            selector: args.selector ? String(args.selector) : undefined,
            attribute: opts.attribute,
            scope,
          });
          break;
        case 'screenshot':
          result = await this.browserAgentService.screenshot(conversationId, {
            fullPage: opts.fullPage,
            scope,
          });
          break;
        case 'analyze': {
          const analysis = await this.browserAgentService.analyzePage(undefined, conversationId);
          result = { success: true, action: 'analyze', pageAnalysis: analysis };
          break;
        }
        case 'test_xss':
          result = await this.browserAgentService.testReflectedXss(
            conversationId,
            String(opts.formSelector ?? ''),
            String(opts.payload ?? ''),
            { scope, inputSelector: opts.inputSelector },
          );
          break;
        case 'check_csrf':
          result = await this.browserAgentService.checkCsrfTokens(conversationId, scope);
          break;
        case 'get_auth_state':
          result = await this.browserAgentService.getAuthState(conversationId);
          break;
        case 'set_auth_state':
          result = await this.browserAgentService.setAuthState(conversationId, opts.authState || {}, scope);
          break;
        case 'save_storage_state':
          result = await this.browserAgentService.saveStorageState(conversationId);
          break;
        default:
          return JSON.stringify({ error: `Unknown browser_action: ${action}` });
      }
      return JSON.stringify(result);
    } catch (e) {
      // BrowserLaunchError = all retries exhausted — return minimal error, DON'T push to Hacktivity
      if (e instanceof BrowserLaunchError) {
        return JSON.stringify({ success: false, action, error: (e as Error).message, _skipHacktivity: true });
      }
      return JSON.stringify({ success: false, action, error: (e as Error).message });
    }
  }

  // ─── Research Browser Handlers ──────────────────────────────────────

  private async handleResearchBrowse(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    const url = String(args.url ?? '').trim();
    if (!url) {
      return JSON.stringify({ error: 'research_browse requires url (must be from an allowed research domain: CVE databases, exploit-db, OWASP, HackTricks, GitHub advisories, security blogs)' });
    }

    const conversationId = context.conversationId || context.jobId;
    if (!conversationId) {
      return JSON.stringify({ error: 'research_browse requires an active conversation' });
    }

    try {
      const result = await this.researchBrowserService.researchBrowse(conversationId, url);
      return JSON.stringify(result, null, 2);
    } catch (err: any) {
      return JSON.stringify({ success: false, url, error: `research_browse failed: ${err?.message || String(err)}` });
    }
  }

  private async handleResearchSearch(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    const query = String(args.query ?? '').trim();
    if (!query) {
      return JSON.stringify({ error: 'research_search requires query (e.g. "PHP 5.6 known vulnerabilities", "CVE-2024-1234 exploit")' });
    }

    const conversationId = context.conversationId || context.jobId;
    if (!conversationId) {
      return JSON.stringify({ error: 'research_search requires an active conversation' });
    }

    try {
      const result = await this.researchBrowserService.researchSearch(conversationId, query);
      return JSON.stringify(result, null, 2);
    } catch (err: any) {
      return JSON.stringify({ success: false, query, results: [], totalResults: 0, error: `research_search failed: ${err?.message || String(err)}` });
    }
  }

  private async handleWebSearch(args: Record<string, any>, context: ToolExecutionContext): Promise<string> {
    const query = String(args.query ?? '').trim();
    const type = String(args.type ?? 'exploit').trim() as 'exploit' | 'technique' | 'reference';
    const url = args.url ? String(args.url).trim() : undefined;
    const sessionId = context.conversationId || context.jobId || 'global';

    if (!query) {
      return JSON.stringify({ error: 'web_search requires a query. For exploit: product name or CVE ID. For technique: attack technique name. For reference: descriptive label.' });
    }

    if (!['exploit', 'technique', 'reference'].includes(type)) {
      return JSON.stringify({ error: 'web_search type must be one of: exploit, technique, reference' });
    }

    if (type === 'reference' && !url) {
      return JSON.stringify({ error: 'web_search with type="reference" requires a url parameter (must be from a trusted security domain)' });
    }

    try {
      const result = await this.webSearchService.search(query, type, url, sessionId);
      return JSON.stringify(result, null, 2);
    } catch (err: any) {
      return JSON.stringify({
        type,
        query,
        results: [],
        count: 0,
        cached: false,
        search_time_ms: 0,
        error: err?.message || String(err),
      });
    }
  }

  /**
   */
  extractDomainFromArgs(args: Record<string, any>): string | null {
    const a = args ?? {};
    const target = (a.target ?? '').toString().trim();
    if (target) return target;
    const url = (a.url ?? '').toString().trim();
    if (url) return url;
    const cmd = (a.command ?? '').toString().trim();
    if (cmd) {
      const urlLike = cmd.match(/https?:\/\/[^\s]+/);
      if (urlLike) return urlLike[0];
    }
    return null;
  }

  /**
   * One-line description for reasoning event before each tool (Cursor-style).
   */
  formatToolReasoning(name: string, args: Record<string, any>): string {
    const safeArgs = args ?? {};
    const q = (safeArgs.query ?? '').toString().trim();
    const pathVal = (safeArgs.path ?? '').toString().trim();
    const cmd = (safeArgs.command ?? '').toString().trim();
    const maxLen = 60;
    switch (name) {
      case 'memory_search':
        return q ? `Searching memory for: ${q.slice(0, maxLen)}${q.length > maxLen ? '...' : ''}` : 'Searching memory...';
      case 'memory_get':
        return pathVal ? `Reading ${pathVal}` : 'Reading file...';
      case 'write_file':
        return pathVal ? `Writing to ${pathVal}` : 'Writing...';
      case 'write_script':
        return (safeArgs.filename as string)?.trim()
          ? `Writing script: ${String(safeArgs.filename).slice(0, maxLen)}`
          : 'Writing script...';
      case 'exec':
        return cmd ? `Running: ${cmd.slice(0, maxLen)}${cmd.length > maxLen ? '...' : ''}` : 'Running command...';
      case 'craft_payload':
        return (safeArgs.script as string)?.trim()
          ? `Running payload script: ${String(safeArgs.script).slice(0, maxLen)}${String(safeArgs.script).length > maxLen ? '...' : ''}`
          : 'Running payload script...';
      case 'report_finding':
        return (safeArgs.detail as string)?.trim()
          ? `Saving finding: ${String(safeArgs.detail).slice(0, maxLen)}${String(safeArgs.detail).length > maxLen ? '...' : ''}`
          : 'Saving finding to report...';
      case 'jwt_analyze':
        return 'Analyzing JWT token for vulnerabilities...';
      case 'create_pentest_plan':
        return 'Creating pentest plan...';
      case 'update_pentest_phase':
        return safeArgs.phase ? `Updating phase: ${String(safeArgs.phase)}` : 'Updating pentest phase...';
      case 'add_skill':
        return (safeArgs.name as string)?.trim()
          ? `Adding skill: ${String(safeArgs.name).slice(0, maxLen)}`
          : 'Adding skill...';
      case 'download_skill':
        return (safeArgs.path as string)?.trim()
          ? `Downloading skill: ${String(safeArgs.path).slice(0, maxLen)}`
          : 'Listing skills...';
      case 'download_agent':
        return 'Downloading agent info...';
      case 'git_search':
        return (safeArgs.query as string)?.trim()
          ? `Searching GitHub: ${String(safeArgs.query).slice(0, maxLen)}`
          : 'Searching GitHub...';
      case 'agents_list':
        return 'Listing allowed agent roles...';
      case 'sessions_list':
        return 'Listing sessions...';
      case 'sessions_history':
        return safeArgs.session_id ? `Fetching history for session ${String(safeArgs.session_id).slice(0, 8)}...` : 'Fetching session history...';
      case 'sessions_send':
        return (safeArgs.message as string)?.trim()
          ? `Sending to session: ${String(safeArgs.message).slice(0, maxLen)}${String(safeArgs.message).length > maxLen ? '...' : ''}`
          : 'Sending message to session...';
      case 'sessions_spawn':
        return safeArgs.role ? `Spawning sub-agent: ${String(safeArgs.role)}` : 'Spawning sub-agent session...';
      case 'session_status':
        return safeArgs.session_id ? `Status for session ${String(safeArgs.session_id).slice(0, 8)}...` : 'Session status...';
      case 'attack_chain':
        return safeArgs.chain_name
          ? `Running attack chain: ${String(safeArgs.chain_name)}`
          : safeArgs.list_chains
            ? 'Listing available attack chains...'
            : 'Running custom attack chain...';
      case 'browser_action':
        return safeArgs.action
          ? `Browser: ${String(safeArgs.action)}${safeArgs.url ? ` on ${String(safeArgs.url).slice(0, maxLen)}` : ''}${safeArgs.selector ? ` → ${String(safeArgs.selector).slice(0, maxLen)}` : ''}`
          : 'Running browser action...';
      case 'global_memory':
        return safeArgs.action === 'search'
          ? `Searching global memory: ${String(safeArgs.query || '').slice(0, maxLen)}...`
          : safeArgs.action === 'save'
            ? `Saving to global memory: ${String(safeArgs.key || '').slice(0, maxLen)}`
            : `Updating global memory: ${String(safeArgs.key || '').slice(0, maxLen)}`;
      case 'research_browse':
        return (safeArgs.url as string)?.trim()
          ? `Research browsing: ${String(safeArgs.url).slice(0, maxLen)}${String(safeArgs.url).length > maxLen ? '...' : ''}`
          : 'Browsing research page...';
      case 'research_search':
        return (safeArgs.query as string)?.trim()
          ? `Research searching: ${String(safeArgs.query).slice(0, maxLen)}${String(safeArgs.query).length > maxLen ? '...' : ''}`
          : 'Searching for research...';
      default:
        return `Running: ${name}`;
    }
  }

  // ─── Global Memory Handler ──────────────────────────────────────────

  private async handleGlobalMemory(args: Record<string, any>): Promise<string> {
    const action = String(args.action ?? '').trim();
    if (!action) {
      return JSON.stringify({ error: 'global_memory requires action (search, save, update)' });
    }

    try {
      switch (action) {
        case 'search': {
          const query = String(args.query ?? '').trim();
          if (!query) {
            return JSON.stringify({ error: 'search requires query' });
          }
          const category = args.category ? String(args.category) : undefined;
          const maxResults = Number(args.max_results) || 20;
          const results = await this.globalMemoryService.search(
            query,
            category as any,
            maxResults,
          );
          return JSON.stringify({
            results,
            count: results.length,
            hint: results.length === 0
              ? 'No patterns found. Use global_memory(action: "save") to add a new learning.'
              : undefined,
          }, null, 2);
        }

        case 'save': {
          const category = String(args.category ?? '').trim();
          const key = String(args.key ?? '').trim();
          if (!category || !key) {
            return JSON.stringify({ error: 'save requires category and key' });
          }
          const value = args.value && typeof args.value === 'object' ? args.value : {};
          const confidence = args.confidence != null ? Number(args.confidence) : undefined;
          const saved = await this.globalMemoryService.save({
            category: category as any,
            key,
            value,
            confidence,
          });
          return JSON.stringify({
            ok: true,
            id: saved.id,
            category: saved.category,
            key: saved.key,
            confidence: saved.confidence,
            message: 'Pattern saved to global memory',
          });
        }

        case 'update': {
          const category = String(args.category ?? '').trim();
          const key = String(args.key ?? '').trim();
          if (!category || !key) {
            return JSON.stringify({ error: 'update requires category and key' });
          }
          const updates: { confidence?: number; value?: Record<string, any> } = {};
          if (args.confidence != null) updates.confidence = Number(args.confidence);
          if (args.value && typeof args.value === 'object') updates.value = args.value;

          const updated = await this.globalMemoryService.update(
            category as any,
            key,
            updates,
          );
          if (!updated) {
            return JSON.stringify({ error: `Not found: ${category}/${key}. Use save action first.` });
          }
          return JSON.stringify({
            ok: true,
            id: updated.id,
            hitCount: updated.hitCount,
            confidence: updated.confidence,
            lastUsedAt: updated.lastUsedAt,
            message: 'Pattern updated (hit_count incremented)',
          });
        }

        default:
          return JSON.stringify({ error: `Unknown global_memory action: ${action}. Use search, save, or update.` });
      }
    } catch (err: any) {
      return JSON.stringify({ error: `global_memory failed: ${err?.message || String(err)}` });
    }
  }

  // ─── OOB Detector ─────────────────────────────────────────────

  private async handleOobTest(args: Record<string, any>): Promise<string> {
    const action = String(args.action ?? 'create').trim();
    try {
      switch (action) {
        case 'create': {
          const result = await this.oobDetectorService.createTest({
            payloadType: args.payload_type ? String(args.payload_type) as OobPayloadType : undefined,
            targetUrl: args.target_url ? String(args.target_url) : undefined,
            vulnType: args.vuln_type ? String(args.vuln_type) : undefined,
            timeoutMs: args.timeout_ms ? Number(args.timeout_ms) : undefined,
            templateId: args.template_id ? String(args.template_id) : undefined,
          });
          return JSON.stringify(result);
        }
        case 'status': {
          const testId = String(args.test_id ?? '').trim();
          if (!testId) return JSON.stringify({ error: 'oob_test status requires test_id' });
          const result = await this.oobDetectorService.getStatus(testId);
          return JSON.stringify(result);
        }
        case 'wait': {
          const testId = String(args.test_id ?? '').trim();
          if (!testId) return JSON.stringify({ error: 'oob_test wait requires test_id' });
          const waitMs = args.wait_ms ? Number(args.wait_ms) : undefined;
          const result = await this.oobDetectorService.waitForCallback(testId, waitMs);
          return JSON.stringify(result);
        }
        case 'cancel': {
          const testId = String(args.test_id ?? '').trim();
          if (!testId) return JSON.stringify({ error: 'oob_test cancel requires test_id' });
          const result = await this.oobDetectorService.cancelTest(testId);
          return JSON.stringify(result);
        }
        case 'templates': {
          const vulnType = args.vuln_type ? String(args.vuln_type) : undefined;
          const templates = this.oobDetectorService.getTemplates(vulnType);
          return JSON.stringify({ templates, count: templates.length });
        }
        case 'list': {
          const limit = args.limit ? Number(args.limit) : 20;
          const tests = await this.oobDetectorService.listTests(limit);
          return JSON.stringify({ tests, count: tests.length });
        }
        default:
          return JSON.stringify({ error: `Unknown oob_test action: ${action}. Use create, status, wait, cancel, templates, or list.` });
      }
    } catch (err: any) {
      return JSON.stringify({ error: `oob_test failed: ${err?.message || String(err)}` });
    }
  }

  /**
   * Log tool execution to Hacktivity.
   * Skips browser launch failures (_skipHacktivity flag) — those are internal errors only.
   */
  async logToolExecution(
    userId: string,
    conversationId: string | undefined,
    args: Record<string, any>,
    toolResult: string,
    toolName?: string,
  ): Promise<void> {
    if (!userId) return;

    // Skip browser launch failures — only log WARNING internally, not to Hacktivity
    try {
      const parsed = JSON.parse(toolResult);
      if (parsed._skipHacktivity === true) return;
    } catch {
      // Not JSON or parse error — continue with normal logging
    }

    const domain = this.extractDomainFromArgs(args);
    try {
      await this.hacktivityService.create(userId, {
        conversationId: conversationId ?? null,
        domain: domain ?? null,
        result: stripAnsi(toolResult),
        toolArgs: toolName ? { ...args, __tool_name: toolName } : args,
      });
    } catch (err: any) {
      console.warn('[Hacktivity] log failed', err?.message);
    }
  }
}
