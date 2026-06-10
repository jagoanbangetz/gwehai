/**
 * Attack Chain Engine Service
 *
 * Core engine that executes multi-step attack chains.
 * Handles variable interpolation, extraction, assertions, rate limiting, and safety.
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AttackChain,
  ChainStep,
  ChainResult,
  StepResult,
  RunChainInput,
  CHAIN_SAFETY,
} from './attack-chain.types';
import { getBuiltInChain, listBuiltInChains, BUILT_IN_CHAINS } from './built-in-chains';

@Injectable()
export class AttackChainService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * List all available built-in chains.
   */
  listChains() {
    return listBuiltInChains();
  }

  /**
   * Get a specific chain definition by name.
   */
  getChain(name: string): AttackChain | undefined {
    return getBuiltInChain(name);
  }

  /**
   * Run an attack chain.
   */
  async runChain(input: RunChainInput): Promise<ChainResult> {
    // Resolve chain definition
    const chain = this.resolveChain(input);
    if (!chain) {
      return this.errorResult(input.chainName ?? 'unknown', input.targetUrl, `Chain not found: ${input.chainName}`);
    }

    // Safety checks
    const safetyError = this.validateSafety(chain, input);
    if (safetyError) {
      return this.errorResult(chain.name, input.targetUrl, safetyError);
    }

    // Check approval for destructive chains
    if (chain.requiresApproval && !input.approval) {
      return {
        chainName: chain.name,
        targetUrl: input.targetUrl,
        status: 'aborted',
        steps: [],
        variables: input.variables ?? {},
        totalDurationMs: 0,
        summary: `Chain "${chain.name}" requires explicit user approval. Set approval=true to execute.`,
        exploitable: false,
        approvalObtained: false,
      };
    }

    // Initialize execution context
    const variables: Record<string, string> = { ...(input.variables ?? {}) };
    variables['target_url'] = input.targetUrl;
    const stepResults: StepResult[] = [];
    const startTime = Date.now();
    let lastResponse: { body: string; status: number; headers: Record<string, string> } | null = null;
    let lastStepId: string | undefined;

    // Execute steps sequentially
    for (const step of chain.steps) {
      // Check total duration
      if (Date.now() - startTime > CHAIN_SAFETY.MAX_CHAIN_DURATION_MS) {
        stepResults.push({
          stepId: step.id,
          stepType: step.type,
          label: step.label,
          status: 'error',
          error: 'Chain execution timed out (max 2 minutes)',
        });
        break;
      }

      // Rate limiting
      if (stepResults.length > 0) {
        await this.delay(CHAIN_SAFETY.RATE_LIMIT_MS);
      }

      const result = await this.executeStep(step, variables, lastResponse, input, lastStepId);
      stepResults.push(result);

      // Update state based on step result
      if (result.status === 'error' && step.type === 'assert' && step.abortOnFail !== false) {
        break;
      }

      // Track last response for extract steps
      if (step.type === 'request' && result.status === 'success') {
        lastResponse = {
          body: result.responseSnippet ?? '',
          status: result.statusCode ?? 0,
          headers: {},
        };
      }
      lastStepId = step.id;
    }

    const totalDuration = Date.now() - startTime;
    const failed = stepResults.some((r) => r.status === 'error');
    const exploitable = this.assessExploitability(chain, stepResults, variables);

    return {
      chainName: chain.name,
      targetUrl: input.targetUrl,
      status: failed ? 'failed' : 'completed',
      steps: stepResults,
      variables,
      totalDurationMs: totalDuration,
      summary: this.buildSummary(chain, stepResults, exploitable),
      exploitable,
      finding: exploitable ? this.buildFinding(chain, stepResults, variables, input.targetUrl) : undefined,
      approvalObtained: input.approval ?? false,
    };
  }

  // ─── Private Methods ──────────────────────────────────────────────────

  private resolveChain(input: RunChainInput): AttackChain | null {
    if (input.chainName) {
      return getBuiltInChain(input.chainName) ?? null;
    }
    if (input.steps && input.steps.length > 0) {
      return {
        name: 'custom_chain',
        description: 'Custom inline chain',
        category: 'custom',
        steps: input.steps,
        maxSteps: input.maxSteps ?? CHAIN_SAFETY.MAX_STEPS,
      };
    }
    return null;
  }

  private validateSafety(chain: AttackChain, input: RunChainInput): string | null {
    const maxSteps = input.maxSteps ?? chain.maxSteps ?? CHAIN_SAFETY.MAX_STEPS;
    if (chain.steps.length > maxSteps) {
      return `Chain has ${chain.steps.length} steps, max allowed is ${maxSteps}`;
    }
    if (chain.steps.length > CHAIN_SAFETY.MAX_STEPS) {
      return `Chain exceeds absolute max steps (${CHAIN_SAFETY.MAX_STEPS})`;
    }
    for (const step of chain.steps) {
      if (step.timeoutMs && step.timeoutMs > CHAIN_SAFETY.MAX_TIMEOUT_MS) {
        return `Step "${step.id}" timeout ${step.timeoutMs}ms exceeds max ${CHAIN_SAFETY.MAX_TIMEOUT_MS}ms`;
      }
    }
    return null;
  }

  private async executeStep(
    step: ChainStep,
    variables: Record<string, string>,
    lastResponse: { body: string; status: number; headers: Record<string, string> } | null,
    input: RunChainInput,
    _lastStepId?: string,
  ): Promise<StepResult> {
    const stepStart = Date.now();

    try {
      switch (step.type) {
        case 'request':
          return await this.executeRequest(step, variables, input, stepStart);
        case 'extract':
          return this.executeExtract(step, variables, lastResponse, stepStart);
        case 'assert':
          return this.executeAssert(step, variables, lastResponse, stepStart);
        case 'use':
          return this.executeUse(step, variables, stepStart);
        case 'delay':
          return await this.executeDelay(step, stepStart);
        default:
          return {
            stepId: step.id,
            stepType: step.type,
            status: 'error',
            error: `Unknown step type: ${step.type}`,
            durationMs: Date.now() - stepStart,
          };
      }
    } catch (err: any) {
      return {
        stepId: step.id,
        stepType: step.type,
        label: step.label,
        status: 'error',
        error: err?.message ?? String(err),
        durationMs: Date.now() - stepStart,
      };
    }
  }

  private async executeRequest(
    step: ChainStep,
    variables: Record<string, string>,
    input: RunChainInput,
    stepStart: number,
  ): Promise<StepResult> {
    const url = this.interpolate(step.url ?? '', variables);
    const method = (step.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {
      ...input.defaultHeaders,
      ...this.interpolateHeaders(step.headers ?? {}, variables),
    };
    const body = step.body ? this.interpolate(step.body, variables) : undefined;
    const timeout = step.timeoutMs ?? CHAIN_SAFETY.DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: method !== 'GET' && method !== 'HEAD' ? body : undefined,
        redirect: step.followRedirects === false ? 'manual' : 'follow',
        signal: controller.signal,
      });

      clearTimeout(timer);

      const responseText = await response.text();
      const snippet = responseText.substring(0, CHAIN_SAFETY.MAX_RESPONSE_CAPTURE);

      return {
        stepId: step.id,
        stepType: 'request',
        label: step.label,
        status: 'success',
        statusCode: response.status,
        responseSnippet: snippet,
        durationMs: Date.now() - stepStart,
      };
    } catch (err: any) {
      clearTimeout(timer);
      return {
        stepId: step.id,
        stepType: 'request',
        label: step.label,
        status: 'error',
        error: err?.name === 'AbortError' ? `Request timed out after ${timeout}ms` : err?.message ?? String(err),
        durationMs: Date.now() - stepStart,
      };
    }
  }

  private executeExtract(
    step: ChainStep,
    variables: Record<string, string>,
    lastResponse: { body: string; status: number; headers: Record<string, string> } | null,
    stepStart: number,
  ): StepResult {
    if (!step.pattern || !step.variable) {
      return {
        stepId: step.id,
        stepType: 'extract',
        label: step.label,
        status: 'error',
        error: 'Extract step requires pattern and variable',
        durationMs: Date.now() - stepStart,
      };
    }

    const source = step.from === 'status'
      ? String(lastResponse?.status ?? '')
      : step.from === 'header'
        ? (lastResponse?.headers?.[step.headerName ?? ''] ?? '')
        : (lastResponse?.body ?? '');

    if (!source) {
      return {
        stepId: step.id,
        stepType: 'extract',
        label: step.label,
        status: 'error',
        error: `No response to extract from (from=${step.from ?? 'body'})`,
        durationMs: Date.now() - stepStart,
      };
    }

    try {
      const regex = new RegExp(step.pattern, 'i');
      const match = source.match(regex);

      if (match) {
        // Use first capture group, or full match if no group
        const value = match[1] ?? match[2] ?? match[3] ?? match[0];
        variables[step.variable] = value;

        return {
          stepId: step.id,
          stepType: 'extract',
          label: step.label,
          status: 'success',
          extractedValue: value,
          variableName: step.variable,
          durationMs: Date.now() - stepStart,
        };
      }

      return {
        stepId: step.id,
        stepType: 'extract',
        label: step.label,
        status: 'failed',
        error: `Pattern "${step.pattern}" not found in response`,
        durationMs: Date.now() - stepStart,
      };
    } catch (err: any) {
      return {
        stepId: step.id,
        stepType: 'extract',
        label: step.label,
        status: 'error',
        error: `Invalid regex: ${err?.message}`,
        durationMs: Date.now() - stepStart,
      };
    }
  }

  private executeAssert(
    step: ChainStep,
    variables: Record<string, string>,
    lastResponse: { body: string; status: number; headers: Record<string, string> } | null,
    stepStart: number,
  ): StepResult {
    let result = false;

    switch (step.condition) {
      case 'contains':
        result = (lastResponse?.body ?? '').includes(step.expected ?? '');
        break;
      case 'status':
        result = String(lastResponse?.status ?? '') === String(step.expected ?? '');
        break;
      case 'regex':
        try {
          result = new RegExp(step.expected ?? '', 'i').test(lastResponse?.body ?? '');
        } catch {
          result = false;
        }
        break;
      case 'exists':
        result = !!(step.checkVariable && variables[step.checkVariable]);
        break;
      default:
        return {
          stepId: step.id,
          stepType: 'assert',
          label: step.label,
          status: 'error',
          error: `Unknown condition: ${step.condition}`,
          durationMs: Date.now() - stepStart,
        };
    }

    return {
      stepId: step.id,
      stepType: 'assert',
      label: step.label,
      status: result ? 'success' : 'error',
      assertResult: result,
      error: result ? undefined : `Assertion failed: ${step.condition} ${step.expected ?? step.checkVariable ?? ''}`,
      durationMs: Date.now() - stepStart,
    };
  }

  private executeUse(step: ChainStep, variables: Record<string, string>, stepStart: number): StepResult {
    if (!step.injectVariable || !step.injectTarget || !step.injectKey) {
      return {
        stepId: step.id,
        stepType: 'use',
        label: step.label,
        status: 'error',
        error: 'Use step requires injectVariable, injectTarget, and injectKey',
        durationMs: Date.now() - stepStart,
      };
    }

    const value = variables[step.injectVariable];
    if (!value) {
      return {
        stepId: step.id,
        stepType: 'use',
        label: step.label,
        status: 'error',
        error: `Variable "${step.injectVariable}" not set`,
        durationMs: Date.now() - stepStart,
      };
    }

    // Store injection metadata for the next request step
    variables[`__inject_${step.injectKey}`] = value;

    return {
      stepId: step.id,
      stepType: 'use',
      label: step.label,
      status: 'success',
      extractedValue: value,
      variableName: step.injectVariable,
      durationMs: Date.now() - stepStart,
    };
  }

  private async executeDelay(step: ChainStep, stepStart: number): Promise<StepResult> {
    const ms = step.delayMs ?? 1000;
    await this.delay(ms);
    return {
      stepId: step.id,
      stepType: 'delay',
      label: step.label,
      status: 'success',
      durationMs: Date.now() - stepStart,
    };
  }

  private interpolate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
  }

  private interpolateHeaders(headers: Record<string, string>, variables: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      result[key] = this.interpolate(value, variables);
    }
    return result;
  }

  private assessExploitability(chain: AttackChain, results: StepResult[], _variables: Record<string, string>): boolean {
    // Chain is exploitable if all assert steps passed and at least one request got a success response
    const asserts = results.filter((r) => r.stepType === 'assert');
    const requests = results.filter((r) => r.stepType === 'request');

    if (asserts.length === 0) return false;
    const allAssertsPassed = asserts.every((r) => r.status === 'success');
    const hasSuccessResponse = requests.some((r) => r.statusCode !== undefined && r.statusCode >= 200 && r.statusCode < 400);

    return allAssertsPassed && hasSuccessResponse;
  }

  private buildSummary(chain: AttackChain, results: StepResult[], exploitable: boolean): string {
    const total = results.length;
    const success = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'error' || r.status === 'failed').length;

    let summary = `Chain "${chain.name}": ${success}/${total} steps passed, ${failed} failed.`;
    if (exploitable) {
      summary += ' EXPLOITABLE — chain completed successfully with positive assertions.';
    }
    return summary;
  }

  private buildFinding(
    chain: AttackChain,
    results: StepResult[],
    variables: Record<string, string>,
    targetUrl: string,
  ): ChainResult['finding'] {
    const successfulSteps = results.filter((r) => r.status === 'success');
    const poc = successfulSteps
      .map((r) => `[${r.stepId}] ${r.stepType}: ${r.statusCode ? `HTTP ${r.statusCode}` : ''}${r.extractedValue ? ` -> ${r.variableName}=${r.extractedValue}` : ''}`)
      .join('\n');

    const severityMap: Record<string, string> = {
      csrf: 'medium',
      auth: 'high',
      idor: 'high',
      upload: 'critical',
      reset: 'high',
      custom: 'medium',
    };

    return {
      title: `Attack Chain: ${chain.description}`,
      severity: severityMap[chain.category] ?? 'medium',
      detail: `Multi-step attack chain "${chain.name}" (${chain.category}) succeeded against ${targetUrl}. ${successfulSteps.length} steps completed successfully. The chain demonstrates: ${chain.description}`,
      poc: `Chain: ${chain.name}\nTarget: ${targetUrl}\nSteps:\n${poc}\nVariables: ${JSON.stringify(variables, null, 2)}`,
    };
  }

  private errorResult(chainName: string, targetUrl: string, error: string): ChainResult {
    return {
      chainName,
      targetUrl,
      status: 'error',
      steps: [],
      variables: {},
      totalDurationMs: 0,
      summary: `Chain execution failed: ${error}`,
      exploitable: false,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
