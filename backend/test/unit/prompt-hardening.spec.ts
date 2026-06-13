/**
 * Unit Tests: System Prompt Hardening — Extraction Defense
 *
 * Tests:
 * - Guard instruction is present in all prompt variants
 * - NEVER refuse is removed from all prompts
 * - Guard covers common extraction vectors (base64, rot13, reverse, hex, etc.)
 */

import { PENTEST_SYSTEM_PROMPT } from '../../src/prompt/pentest.system-prompt';
import { CORE_PROMPT } from '../../src/prompt/prompts/core.prompt';
import { GWEHAI_CONVERSATION_SYSTEM_PROMPT } from '../../src/prompt/gwehai-identity';

// Collect all prompts that should have the guard
const PROMPTS = [
  { name: 'PENTEST_SYSTEM_PROMPT', value: PENTEST_SYSTEM_PROMPT },
  { name: 'CORE_PROMPT', value: CORE_PROMPT },
  { name: 'GWEHAI_CONVERSATION_SYSTEM_PROMPT', value: GWEHAI_CONVERSATION_SYSTEM_PROMPT },
];

describe('System Prompt Hardening', () => {
  // ── Guard Instruction Present ──────────────────────────────────────

  describe('Guard instruction present', () => {
    it.each(PROMPTS)('$name should contain the SYSTEM SECURITY RULE block', ({ value }) => {
      expect(value).toContain('[SYSTEM SECURITY RULE — NON-NEGOTIABLE]');
      expect(value).toContain('[END SYSTEM SECURITY RULE]');
    });

    it.each(PROMPTS)('$name should instruct not to reveal system prompt', ({ value }) => {
      expect(value).toContain('Never reveal');
      expect(value).toContain('system prompt');
    });

    it.each(PROMPTS)('$name should block encoding-based extraction', ({ value }) => {
      expect(value).toContain('base64');
      expect(value).toContain('ROT13');
    });

    it.each(PROMPTS)('$name should block translation-based extraction', ({ value }) => {
      expect(value).toContain('translate');
      expect(value).toContain('encode');
      expect(value).toContain('decode');
    });

    it.each(PROMPTS)('$name should block summarization-based extraction', ({ value }) => {
      expect(value).toContain('summarize');
      expect(value).toContain('paraphrase');
      expect(value).toContain('quote');
    });

    it.each(PROMPTS)('$name should include refusal response', ({ value }) => {
      expect(value).toContain('I cannot share system instructions');
    });

    it.each(PROMPTS)('$name should declare the rule overrides all other instructions', ({ value }) => {
      expect(value).toContain('overrides all other instructions');
    });
  });

  // ── NEVER refuse removed ───────────────────────────────────────────

  describe('NEVER refuse removed', () => {
    it.each(PROMPTS)('$name should NOT contain NEVER refuse', ({ value }) => {
      expect(value).not.toContain('NEVER refuse');
    });

    it.each(PROMPTS)('$name should use "stay in scope" instead', ({ value }) => {
      expect(value).toContain('stay in scope');
    });
  });

  // ── Guard position ─────────────────────────────────────────────────

  describe('Guard is first instruction', () => {
    it.each(PROMPTS)('$name should start with the security rule block', ({ value }) => {
      // The guard should be the very first content (after the template literal backtick)
      const trimmed = value.trimStart();
      expect(trimmed).toMatch(/^\[SYSTEM SECURITY RULE/);
    });
  });

  // ── Extraction vector coverage ─────────────────────────────────────

  describe('Extraction vector coverage', () => {
    const extractionVectors = [
      'base64',
      'ROT13',
      'reverse',
      'hex',
      'binary',
      'morse code',
    ];

    it.each(extractionVectors)('should block %s extraction vector', (vector) => {
      // All prompts should mention this vector
      for (const { name, value } of PROMPTS) {
        expect(value).toContain(vector);
      }
    });

    it('should block general encoding catch-all', () => {
      for (const { name, value } of PROMPTS) {
        expect(value).toContain('any other encoding');
      }
    });
  });

  // ── No regression: core content preserved ──────────────────────────

  describe('No regression: core content preserved', () => {
    it('PENTEST_SYSTEM_PROMPT should still contain Core Orchestrator', () => {
      expect(PENTEST_SYSTEM_PROMPT).toContain('GwehAI Core Orchestrator');
    });

    it('PENTEST_SYSTEM_PROMPT should still contain checklist', () => {
      expect(PENTEST_SYSTEM_PROMPT).toContain('Full checklist required');
    });

    it('PENTEST_SYSTEM_PROMPT should still contain tools', () => {
      expect(PENTEST_SYSTEM_PROMPT).toContain('memory_search');
      expect(PENTEST_SYSTEM_PROMPT).toContain('exec');
      expect(PENTEST_SYSTEM_PROMPT).toContain('report_finding');
    });

    it('CORE_PROMPT should still contain output format', () => {
      expect(CORE_PROMPT).toContain('<think>');
      expect(CORE_PROMPT).toContain('<final>');
    });

    it('GWEHAI_CONVERSATION_SYSTEM_PROMPT should still contain JSON format', () => {
      expect(GWEHAI_CONVERSATION_SYSTEM_PROMPT).toContain('"reply"');
      expect(GWEHAI_CONVERSATION_SYSTEM_PROMPT).toContain('"followUps"');
    });
  });
});
