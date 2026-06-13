/**
 * Attack Chain Engine — Types & Interfaces
 *
 * Defines the DSL for multi-step attack chains:
 * REQUEST -> EXTRACT -> ASSERT -> USE pattern.
 */

/** A single step in an attack chain */
export interface ChainStep {
  /** Unique step id within the chain (auto-assigned if omitted) */
  id: string;
  /** Step type */
  type: 'request' | 'extract' | 'assert' | 'use' | 'delay';
  /** Human-readable label */
  label?: string;

  // --- REQUEST fields ---
  /** HTTP method (GET, POST, etc.) */
  method?: string;
  /** URL template — supports {{variable}} interpolation */
  url?: string;
  /** Headers — values support {{variable}} interpolation */
  headers?: Record<string, string>;
  /** Request body template — supports {{variable}} interpolation */
  body?: string;
  /** Follow redirects (default true) */
  followRedirects?: boolean;
  /** Timeout in ms (default 10000) */
  timeoutMs?: number;

  // --- EXTRACT fields ---
  /** Regex or JSONPath pattern to extract from response */
  pattern?: string;
  /** Where to extract from: 'body' | 'header' | 'status' (default 'body') */
  from?: 'body' | 'header' | 'status';
  /** Specific header name when from='header' */
  headerName?: string;
  /** Variable name to store extracted value */
  variable?: string;
  /** Which step's response to extract from (default: previous step) */
  fromStep?: string;

  // --- ASSERT fields ---
  /** Condition to check: 'contains' | 'status' | 'regex' | 'exists' */
  condition?: 'contains' | 'status' | 'regex' | 'exists';
  /** Expected value for the condition */
  expected?: string;
  /** Variable to check (for 'exists' condition) */
  checkVariable?: string;
  /** If assertion fails, should chain abort? (default true) */
  abortOnFail?: boolean;

  // --- USE fields (variable injection into next request) ---
  /** Variable name to inject */
  injectVariable?: string;
  /** Target location: 'header' | 'body' | 'url' */
  injectTarget?: 'header' | 'body' | 'url';
  /** Target key (header name, body field, or url placeholder) */
  injectKey?: string;

  // --- DELAY fields ---
  /** Delay in milliseconds */
  delayMs?: number;
}

/** Full chain definition */
export interface AttackChain {
  /** Chain identifier */
  name: string;
  /** Human-readable description */
  description: string;
  /** Category: csrf, auth, idor, upload, reset, custom */
  category: 'csrf' | 'auth' | 'idor' | 'upload' | 'reset' | 'custom';
  /** Ordered steps */
  steps: ChainStep[];
  /** Maximum allowed steps (safety) */
  maxSteps?: number;
  /** Default timeout per step in ms */
  defaultTimeoutMs?: number;
  /** Requires explicit user approval before execution? */
  requiresApproval?: boolean;
  /** Tags for filtering */
  tags?: string[];
}

/** Result of a single step execution */
export interface StepResult {
  stepId: string;
  stepType: ChainStep['type'];
  label?: string;
  status: 'success' | 'failed' | 'skipped' | 'error';
  /** HTTP status code (for request steps) */
  statusCode?: number;
  /** Response body snippet (truncated) */
  responseSnippet?: string;
  /** Extracted value (for extract steps) */
  extractedValue?: string;
  /** Variable name where value was stored */
  variableName?: string;
  /** Assertion result (for assert steps) */
  assertResult?: boolean;
  /** Error message if status is 'error' */
  error?: string;
  /** Duration in ms */
  durationMs?: number;
}

/** Full chain execution result */
export interface ChainResult {
  chainName: string;
  targetUrl: string;
  status: 'completed' | 'failed' | 'aborted' | 'error';
  /** Per-step results */
  steps: StepResult[];
  /** Variables collected during execution */
  variables: Record<string, string>;
  /** Total execution time in ms */
  totalDurationMs: number;
  /** Summary of what happened */
  summary: string;
  /** Whether this chain found an exploitable condition */
  exploitable: boolean;
  /** Recommended finding details if exploitable */
  finding?: {
    title: string;
    severity: string;
    detail: string;
    poc: string;
  };
  /** Safety: was user approval obtained? */
  approvalObtained?: boolean;
}

/** Input for running a chain */
export interface RunChainInput {
  /** Chain name (built-in) or inline chain definition */
  chainName?: string;
  /** Inline chain steps (if not using built-in) */
  steps?: ChainStep[];
  /** Target base URL */
  targetUrl: string;
  /** Pre-set variables (e.g., credentials, tokens) */
  variables?: Record<string, string>;
  /** User approval for destructive chains */
  approval?: boolean;
  /** Custom headers to apply to all requests */
  defaultHeaders?: Record<string, string>;
  /** Override max steps */
  maxSteps?: number;
}

/** Safety limits */
export const CHAIN_SAFETY = {
  MAX_STEPS: 10,
  DEFAULT_TIMEOUT_MS: 10000,
  MAX_TIMEOUT_MS: 30000,
  RATE_LIMIT_MS: 500, // min delay between requests
  MAX_RESPONSE_CAPTURE: 2000, // chars to keep from responses
  MAX_CHAIN_DURATION_MS: 120000, // 2 minutes total
} as const;
