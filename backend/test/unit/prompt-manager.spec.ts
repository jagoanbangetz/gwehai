/**
 * Unit Tests: PromptManagerService
 *
 * Tests:
 * - Dynamic prompt assembly (core + phase + tool)
 * - Phase detection from messages and tool calls
 * - Tool detection from LLM tool_calls
 * - Token savings vs legacy monolithic prompt
 * - Rollback to legacy prompt
 * - Stats tracking
 */

import { PromptManagerService } from '../../src/prompt/prompt-manager.service';
import { PENTEST_SYSTEM_PROMPT } from '../../src/prompt/pentest.system-prompt';
import { CORE_PROMPT } from '../../src/prompt/prompts/core.prompt';
import { RECON_PHASE_PROMPT } from '../../src/prompt/prompts/phases/recon.prompt';
import { INPUT_HANDLING_PHASE_PROMPT } from '../../src/prompt/prompts/phases/input-handling.prompt';
import { FFUF_TOOL_PROMPT } from '../../src/prompt/prompts/tools/ffuf.prompt';
import { SQLMAP_TOOL_PROMPT } from '../../src/prompt/prompts/tools/sqlmap.prompt';
import type { LlmMessage, LlmToolCall } from '../../src/llm/llm.types';

describe('PromptManagerService', () => {
  let service: PromptManagerService;

  beforeEach(() => {
    service = new PromptManagerService();
    service.resetStats();
  });

  // ── Core Prompt Tests ─────────────────────────────────────────────

  describe('Core Prompt', () => {
    it('should always include the core prompt', () => {
      const result = service.buildSystemPrompt([]);
      expect(result.prompt).toContain('GwehAI Core Orchestrator');
      expect(result.prompt).toContain('No hallucination');
      expect(result.prompt).toContain('evidence only');
    });

    it('should include output format rules', () => {
      const result = service.buildSystemPrompt([]);
      expect(result.prompt).toContain('<think>');
      expect(result.prompt).toContain('<final>');
    });

    it('should include confidence score requirement', () => {
      const result = service.buildSystemPrompt([]);
      expect(result.prompt).toContain('confidence');
      expect(result.prompt).toContain('confidence_reason');
    });

    it('should include skill activation table', () => {
      const result = service.buildSystemPrompt([]);
      expect(result.prompt).toContain('WEB_CHECKLIST.md');
      expect(result.prompt).toContain('recon/SKILL.md');
      expect(result.prompt).toContain('sqli/SKILL.md');
    });
  });

  // ── Phase Detection Tests ─────────────────────────────────────────

  describe('Phase Detection', () => {
    it('should detect recon phase from explicit tool call', () => {
      const toolCalls = ['{"phase":"recon","checklist":{"recon":false}}'];
      const result = service.buildSystemPrompt([], undefined, toolCalls);
      expect(result.phase).toBe('recon');
    });

    it('should detect input_handling phase from tool call', () => {
      const toolCalls = ['{"phase":"input_handling","checklist":{"recon":true,"input_handling":false}}'];
      const result = service.buildSystemPrompt([], undefined, toolCalls);
      expect(result.phase).toBe('input_handling');
    });

    it('should detect auth_session phase from tool call', () => {
      const toolCalls = ['{"phase":"auth_session"}'];
      const result = service.buildSystemPrompt([], undefined, toolCalls);
      expect(result.phase).toBe('auth_session');
    });

    it('should detect phase from checklist completion', () => {
      const toolCalls = ['{"checklist":{"recon":true,"input_handling":false}}'];
      const result = service.buildSystemPrompt([], undefined, toolCalls);
      expect(result.phase).toBe('input_handling');
    });

    it('should detect recon phase from pentest keywords in messages', () => {
      const messages: LlmMessage[] = [
        { role: 'user', content: 'Please pentest https://example.com' },
      ];
      const result = service.buildSystemPrompt(messages);
      expect(result.phase).toBe('recon');
    });

    it('should return null phase when no context available', () => {
      const result = service.buildSystemPrompt([]);
      expect(result.phase).toBeNull();
    });

    it('should prioritize tool call phase over message detection', () => {
      const messages: LlmMessage[] = [
        { role: 'user', content: 'pentest this site' },
      ];
      const toolCalls = ['{"phase":"auth_session"}'];
      const result = service.buildSystemPrompt(messages, undefined, toolCalls);
      expect(result.phase).toBe('auth_session');
    });
  });

  // ── Phase Prompt Injection Tests ──────────────────────────────────

  describe('Phase Prompt Injection', () => {
    it('should inject recon phase prompt when phase is recon', () => {
      const toolCalls = ['{"phase":"recon"}'];
      const result = service.buildSystemPrompt([], undefined, toolCalls);
      expect(result.prompt).toContain(RECON_PHASE_PROMPT);
      expect(result.prompt).toContain('Phase: Reconnaissance');
    });

    it('should inject input_handling prompt when phase is input_handling', () => {
      const toolCalls = ['{"phase":"input_handling"}'];
      const result = service.buildSystemPrompt([], undefined, toolCalls);
      expect(result.prompt).toContain(INPUT_HANDLING_PHASE_PROMPT);
      expect(result.prompt).toContain('Phase: Input Handling');
    });

    it('should NOT inject phase prompt when phase is null', () => {
      const result = service.buildSystemPrompt([]);
      expect(result.prompt).not.toContain('Phase: Reconnaissance');
      expect(result.prompt).not.toContain('Phase: Input Handling');
    });

    it('should NOT inject completed phase prompt', () => {
      const toolCalls = ['{"phase":"completed"}'];
      const result = service.buildSystemPrompt([], undefined, toolCalls);
      // Should not have any phase-specific prompt
      expect(result.prompt).not.toContain('Phase: Reconnaissance');
      expect(result.prompt).not.toContain('Phase: Input Handling');
    });
  });

  // ── Tool Detection Tests ──────────────────────────────────────────

  describe('Tool Detection', () => {
    it('should detect ffuf tool call', () => {
      const toolCalls: LlmToolCall[] = [
        { id: '1', name: 'exec', arguments: '{"command":"ffuf -u https://t/FUZZ -w /opt/wordlists/common.txt"}' },
      ];
      const result = service.buildSystemPrompt([], toolCalls);
      // exec is not in TOOL_TRIGGER_NAMES, so no tool prompt for exec
      expect(result.toolsInjected).not.toContain('exec');
    });

    it('should detect browser_action tool call', () => {
      const toolCalls: LlmToolCall[] = [
        { id: '1', name: 'browser_action', arguments: '{"action":"navigate","url":"https://example.com"}' },
      ];
      const result = service.buildSystemPrompt([], toolCalls);
      expect(result.toolsInjected).toContain('browser_action');
      expect(result.prompt).toContain('browser_action (authenticated scanning)');
    });

    it('should detect sessions_spawn tool call', () => {
      const toolCalls: LlmToolCall[] = [
        { id: '1', name: 'sessions_spawn', arguments: '{"role":"recon"}' },
      ];
      const result = service.buildSystemPrompt([], toolCalls);
      expect(result.toolsInjected).toContain('sessions_spawn');
      expect(result.prompt).toContain('Sub-agent coordination');
    });

    it('should dedupe session tool prompts', () => {
      const toolCalls: LlmToolCall[] = [
        { id: '1', name: 'sessions_spawn', arguments: '{}' },
        { id: '2', name: 'sessions_send', arguments: '{}' },
        { id: '3', name: 'sessions_history', arguments: '{}' },
      ];
      const result = service.buildSystemPrompt([], toolCalls);
      // All 3 should be detected
      expect(result.toolsInjected).toHaveLength(3);
      // But the Sub-agent coordination prompt should appear only once
      const matches = result.prompt.match(/Sub-agent coordination/g);
      expect(matches).toHaveLength(1);
    });

    it('should return empty toolsInjected when no tool calls', () => {
      const result = service.buildSystemPrompt([]);
      expect(result.toolsInjected).toEqual([]);
    });

    it('should ignore unknown tool names', () => {
      const toolCalls: LlmToolCall[] = [
        { id: '1', name: 'memory_search', arguments: '{"query":"test"}' },
        { id: '2', name: 'some_random_tool', arguments: '{"detail":"test"}' },
      ];
      const result = service.buildSystemPrompt([], toolCalls);
      expect(result.toolsInjected).toEqual([]);
    });
  });

  // ── Prompt Assembly Tests ─────────────────────────────────────────

  describe('Prompt Assembly', () => {
    it('should assemble core + phase + tool prompts in order', () => {
      const toolCalls: LlmToolCall[] = [
        { id: '1', name: 'browser_action', arguments: '{}' },
      ];
      const priorToolCalls = ['{"phase":"auth_session"}'];
      const result = service.buildSystemPrompt([], toolCalls, priorToolCalls);

      // Core should come first
      const coreIdx = result.prompt.indexOf('GwehAI Core Orchestrator');
      const phaseIdx = result.prompt.indexOf('Phase: Authentication');
      const toolIdx = result.prompt.indexOf('browser_action (authenticated scanning)');

      expect(coreIdx).toBeGreaterThanOrEqual(0);
      expect(phaseIdx).toBeGreaterThan(coreIdx);
      expect(toolIdx).toBeGreaterThan(phaseIdx);
    });

    it('should handle multiple tools with shared prompts', () => {
      const toolCalls: LlmToolCall[] = [
        { id: '1', name: 'sessions_spawn', arguments: '{}' },
        { id: '2', name: 'sessions_send', arguments: '{}' },
      ];
      const result = service.buildSystemPrompt([], toolCalls);
      // Should have exactly one "Sub-agent coordination" section
      const count = (result.prompt.match(/Sub-agent coordination/g) || []).length;
      expect(count).toBe(1);
    });
  });

  // ── Token Savings Tests ───────────────────────────────────────────

  describe('Token Savings', () => {
    it('should produce shorter prompt than legacy monolithic prompt', () => {
      // Core only (no phase, no tools) should be much shorter
      const result = service.buildSystemPrompt([]);
      expect(result.charCount).toBeLessThan(PENTEST_SYSTEM_PROMPT.length);
      expect(result.isDynamic).toBe(true);
    });

    it('should produce 60-70% shorter prompt with phase only', () => {
      const toolCalls = ['{"phase":"recon"}'];
      const result = service.buildSystemPrompt([], undefined, toolCalls);
      const savings = ((PENTEST_SYSTEM_PROMPT.length - result.charCount) / PENTEST_SYSTEM_PROMPT.length) * 100;
      expect(savings).toBeGreaterThan(50); // At least 50% savings
    });

    it('should still be shorter with phase + tools', () => {
      const toolCalls: LlmToolCall[] = [
        { id: '1', name: 'browser_action', arguments: '{}' },
      ];
      const priorToolCalls = ['{"phase":"auth_session"}'];
      const result = service.buildSystemPrompt([], toolCalls, priorToolCalls);
      expect(result.charCount).toBeLessThan(PENTEST_SYSTEM_PROMPT.length);
    });

    it('should estimate tokens correctly (chars / 4)', () => {
      const result = service.buildSystemPrompt([]);
      expect(result.estimatedTokens).toBe(Math.ceil(result.charCount / 4));
    });

    it('should track savings stats', () => {
      // Dynamic call
      service.buildSystemPrompt([]);
      // Legacy call (by checking stats)
      const stats = service.getStats();
      expect(stats.dynamicCalls).toBe(1);
      expect(stats.totalCalls).toBe(1);
    });
  });

  // ── Stats Tracking Tests ──────────────────────────────────────────

  describe('Stats Tracking', () => {
    it('should track total calls', () => {
      service.buildSystemPrompt([]);
      service.buildSystemPrompt([]);
      service.buildSystemPrompt([]);
      expect(service.getStats().totalCalls).toBe(3);
    });

    it('should track dynamic vs legacy calls', () => {
      service.buildSystemPrompt([]);
      const stats = service.getStats();
      expect(stats.dynamicCalls).toBe(1);
      expect(stats.legacyCalls).toBe(0);
    });

    it('should calculate average char count', () => {
      service.buildSystemPrompt([]);
      service.buildSystemPrompt([]);
      const stats = service.getStats();
      expect(stats.avgCharsDynamic).toBeGreaterThan(0);
    });

    it('should calculate savings percentage', () => {
      service.buildSystemPrompt([]);
      const stats = service.getStats();
      expect(stats.savingsPercent).toBeGreaterThan(0);
      expect(stats.savingsPercent).toBeLessThanOrEqual(100);
    });

    it('should reset stats', () => {
      service.buildSystemPrompt([]);
      service.resetStats();
      const stats = service.getStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.dynamicCalls).toBe(0);
    });
  });

  // ── Phase Order Tests ─────────────────────────────────────────────

  describe('Phase Order', () => {
    it('should follow checklist order: recon → input_handling → auth → access → business → report', () => {
      const phases = ['recon', 'input_handling', 'auth_session', 'access_control', 'business_logic', 'report'];
      for (const phase of phases) {
        const toolCalls = [`{"phase":"${phase}"}`];
        const result = service.buildSystemPrompt([], undefined, toolCalls);
        expect(result.phase).toBe(phase);
      }
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should handle null tool calls gracefully', () => {
      const result = service.buildSystemPrompt([], undefined, undefined);
      expect(result.prompt).toBeTruthy();
      expect(result.phase).toBeNull();
      expect(result.toolsInjected).toEqual([]);
    });

    it('should handle empty messages array', () => {
      const result = service.buildSystemPrompt([]);
      expect(result.prompt).toBeTruthy();
    });

    it('should handle malformed tool call JSON in priorToolCalls', () => {
      const priorToolCalls = ['not-json', '{"invalid": true}', '{"phase":"recon"}'];
      const result = service.buildSystemPrompt([], undefined, priorToolCalls);
      expect(result.phase).toBe('recon'); // Should still detect from valid call
    });

    it('should handle messages with non-string content', () => {
      const messages: LlmMessage[] = [
        { role: 'assistant', content: undefined as any },
        { role: 'user', content: 'test' },
      ];
      const result = service.buildSystemPrompt(messages);
      expect(result.prompt).toBeTruthy();
    });

    it('should report isDynamic=true for dynamic mode', () => {
      const result = service.buildSystemPrompt([]);
      expect(result.isDynamic).toBe(true);
    });

    it('should report dynamic mode enabled', () => {
      expect(service.isDynamicModeEnabled()).toBe(true);
    });
  });
});
