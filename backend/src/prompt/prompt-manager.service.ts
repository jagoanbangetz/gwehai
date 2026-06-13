/**
 * Prompt Manager Service
 *
 * Dynamically assembles the system prompt based on:
 * - Current pentest phase (recon, input_handling, auth, etc.)
 * - Tools being used in the current turn (ffuf, sqlmap, nuclei, etc.)
 * - Conversation context (prior messages, tool call history)
 *
 * Instead of injecting the full 185-line prompt every turn,
 * we inject: core (~30 lines) + phase (~20-40 lines) + tool (~5-15 lines)
 * = ~50-85 lines per turn instead of 185 = 60-70% token savings.
 *
 * The old PENTEST_SYSTEM_PROMPT is kept as fallback for rollback.
 */

import { Injectable } from '@nestjs/common';
import {
  CORE_PROMPT,
  PHASE_PROMPTS,
  PHASE_ORDER,
  getPhasePrompt,
  TOOL_PROMPTS,
  TOOL_TRIGGER_NAMES,
  getToolPromptsForTools,
  type PentestPhase,
} from './prompts/index';
import { PENTEST_SYSTEM_PROMPT } from './pentest.system-prompt';
import { ToolAvailabilityService } from '../tools/tool-availability.service';
import type { LlmMessage, LlmToolCall } from '../llm/llm.types';

/** Feature flag: set to false to use legacy monolithic prompt (rollback). */
const USE_DYNAMIC_PROMPT = true;

/** Prompt assembly result with metadata for logging/analysis. */
export interface PromptAssemblyResult {
  /** The assembled prompt string. */
  prompt: string;
  /** Detected phase. */
  phase: PentestPhase | null;
  /** Tool names that triggered tool-specific prompts. */
  toolsInjected: string[];
  /** Token estimate: approximate character count / 4. */
  estimatedTokens: number;
  /** Full prompt char count. */
  charCount: number;
  /** Whether dynamic mode was used (false = legacy fallback). */
  isDynamic: boolean;
}

@Injectable()
export class PromptManagerService {
  /** Stats for token savings tracking. */
  private stats = {
    totalCalls: 0,
    dynamicCalls: 0,
    legacyCalls: 0,
    totalCharsDynamic: 0,
    totalCharsLegacy: 0,
  };

  constructor(private readonly toolAvailability: ToolAvailabilityService) {}

  /**
   * Main entry point: build the system prompt for a given turn.
   *
   * @param messages - Current conversation messages (for phase detection)
   * @param toolCalls - Tool calls from the current LLM response (for tool prompt injection)
   * @param priorToolCalls - Tool calls from previous turns (for phase detection)
   */
  async buildSystemPrompt(
    messages: LlmMessage[],
    toolCalls?: LlmToolCall[],
    priorToolCalls?: string[],
  ): Promise<PromptAssemblyResult> {
    this.stats.totalCalls++;

    // Rollback: use legacy monolithic prompt
    if (!USE_DYNAMIC_PROMPT) {
      this.stats.legacyCalls++;
      this.stats.totalCharsLegacy += PENTEST_SYSTEM_PROMPT.length;
      return {
        prompt: PENTEST_SYSTEM_PROMPT,
        phase: null,
        toolsInjected: [],
        estimatedTokens: Math.ceil(PENTEST_SYSTEM_PROMPT.length / 4),
        charCount: PENTEST_SYSTEM_PROMPT.length,
        isDynamic: false,
      };
    }

    this.stats.dynamicCalls++;

    // 1. Detect current phase from messages + tool call history
    const phase = this.detectPhase(messages, priorToolCalls);

    // 2. Detect tools being used in this turn
    const toolNames = this.detectTools(toolCalls);

    // 3. Assemble prompt: core + phase + tools + available tools
    const parts: string[] = [CORE_PROMPT];

    if (phase && PHASE_PROMPTS[phase]) {
      parts.push(PHASE_PROMPTS[phase]);
    }

    const toolPrompts = getToolPromptsForTools(toolNames);
    if (toolPrompts) {
      parts.push(toolPrompts);
    }

    // 4. Inject available tools list so agent knows what's installed before exec calls.
    //    This prevents the agent from calling tools that don't exist in the container.
    try {
      const availableTools = await this.toolAvailability.getAvailableToolNames();
      if (availableTools.length > 0) {
        parts.push(`## Available Exec Tools\nThe following tools are verified as installed in the pentest environment. Only use these in exec calls:\n${availableTools.join(', ')}\nDo NOT attempt to run tools not listed above — they will fail with "not available" errors.`);
      }
    } catch {
      // Non-blocking: if availability check fails, skip injection
    }

    const assembled = parts.join('\n\n');
    this.stats.totalCharsDynamic += assembled.length;

    return {
      prompt: assembled,
      phase,
      toolsInjected: toolNames,
      estimatedTokens: Math.ceil(assembled.length / 4),
      charCount: assembled.length,
      isDynamic: true,
    };
  }

  /**
   * Detect the current pentest phase from conversation context.
   *
   * Detection strategies (in priority order):
   * 1. Look for recent update_pentest_phase tool calls with phase info
   * 2. Look for phase keywords in recent user/assistant messages
   * 3. Default to 'recon' if a target URL is present but no phase detected
   */
  detectPhase(
    messages: LlmMessage[],
    priorToolCalls?: string[],
  ): PentestPhase | null {
    // Strategy 1: Check for update_pentest_phase tool calls in prior calls
    if (priorToolCalls) {
      for (const call of priorToolCalls) {
        const phase = this.extractPhaseFromToolCall(call);
        if (phase) return phase;
      }
    }

    // Strategy 2: Check messages for phase keywords
    const recentText = messages
      .slice(-5)
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join(' ')
      .toLowerCase();

    // Check for explicit phase mentions in tool results or messages
    for (const phase of PHASE_ORDER) {
      if (phase === 'completed') continue;
      const phaseVariants = [phase, phase.replace(/_/g, ' '), phase.replace(/_/g, '-')];
      if (phaseVariants.some((v) => recentText.includes(v))) {
        return phase;
      }
    }

    // Strategy 3: Detect phase from context clues
    if (recentText.includes('pentest') || recentText.includes('scan this') || recentText.includes('test this')) {
      return 'recon';
    }

    // Strategy 4: Check for checklist progress indicators
    if (recentText.includes('recon') && recentText.includes('complete')) {
      return 'input_handling';
    }
    if (recentText.includes('input_handling') && recentText.includes('complete')) {
      return 'auth_session';
    }
    if (recentText.includes('auth') && recentText.includes('complete')) {
      return 'access_control';
    }

    return null;
  }

  /**
   * Extract phase from an update_pentest_phase tool call string.
   */
  private extractPhaseFromToolCall(call: string): PentestPhase | null {
    try {
      const parsed = JSON.parse(call);
      if (parsed.phase && typeof parsed.phase === 'string') {
        const phase = parsed.phase.toLowerCase() as PentestPhase;
        if (PHASE_ORDER.includes(phase)) return phase;
      }
      // Also check checklist to infer phase
      if (parsed.checklist && typeof parsed.checklist === 'object') {
        const cl = parsed.checklist;
        if (!cl.recon) return 'recon';
        if (!cl.input_handling) return 'input_handling';
        if (!cl.auth_session) return 'auth_session';
        if (!cl.access_control) return 'access_control';
        if (!cl.business_logic) return 'business_logic';
        if (!cl.other) return 'report';
      }
    } catch {
      // not JSON, skip
    }
    return null;
  }

  /**
   * Detect which tools are being called in the current turn.
   * Returns tool names that have specific prompt injections.
   */
  detectTools(toolCalls?: LlmToolCall[]): string[] {
    if (!toolCalls || toolCalls.length === 0) return [];

    const detected: string[] = [];
    for (const tc of toolCalls) {
      const name = tc.name?.toLowerCase();
      if (name && TOOL_TRIGGER_NAMES.includes(name)) {
        detected.push(name);
      }
    }
    return [...new Set(detected)]; // dedupe
  }

  /**
   * Get token savings stats.
   */
  getStats(): {
    totalCalls: number;
    dynamicCalls: number;
    legacyCalls: number;
    avgCharsDynamic: number;
    avgCharsLegacy: number;
    savingsPercent: number;
  } {
    const avgDynamic = this.stats.dynamicCalls > 0
      ? Math.round(this.stats.totalCharsDynamic / this.stats.dynamicCalls)
      : 0;
    const avgLegacy = this.stats.legacyCalls > 0
      ? Math.round(this.stats.totalCharsLegacy / this.stats.legacyCalls)
      : PENTEST_SYSTEM_PROMPT.length;
    const savings = avgLegacy > 0
      ? Math.round(((avgLegacy - avgDynamic) / avgLegacy) * 100)
      : 0;

    return {
      totalCalls: this.stats.totalCalls,
      dynamicCalls: this.stats.dynamicCalls,
      legacyCalls: this.stats.legacyCalls,
      avgCharsDynamic: avgDynamic,
      avgCharsLegacy: avgLegacy,
      savingsPercent: savings,
    };
  }

  /**
   * Reset stats (for testing).
   */
  resetStats(): void {
    this.stats = {
      totalCalls: 0,
      dynamicCalls: 0,
      legacyCalls: 0,
      totalCharsDynamic: 0,
      totalCharsLegacy: 0,
    };
  }

  /**
   * Check if dynamic prompt mode is enabled.
   */
  isDynamicModeEnabled(): boolean {
    return USE_DYNAMIC_PROMPT;
  }
}
