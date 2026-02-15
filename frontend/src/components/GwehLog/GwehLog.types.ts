/**
 * GwehLog – structured event types for the GWEHAI terminal-style log renderer.
 * Phases and blocks follow the exact order: THINKING, EXECUTION, MODULE_LOADER, REASONING.
 */

export type LogPhase = 'THINKING' | 'EXECUTION' | 'MODULE_LOADER' | 'REASONING';

export type LogStatus = 'START' | 'OK' | 'FAIL' | 'INFO';

export interface LogEvent {
  /** Unique identifier */
  id: string;
  /** Optional ISO timestamp */
  ts?: string;
  /** Which block this event belongs to */
  phase: LogPhase;
  /** One line, rendered after → */
  message: string;
  /** Optional metadata, not shown by default */
  status?: LogStatus;
  meta?: Record<string, any>;
}

/** Block order for deterministic rendering */
export const LOG_PHASE_ORDER: LogPhase[] = [
  'THINKING',
  'EXECUTION',
  'MODULE_LOADER',
  'REASONING',
];

/** Header label for each phase */
export const LOG_PHASE_HEADER: Record<LogPhase, string> = {
  THINKING: '[GWEHAI ▸ THINKING]',
  EXECUTION: '[GWEHAI ▸ EXECUTION]',
  MODULE_LOADER: '[GWEHAI ▸ MODULE LOADER]',
  REASONING: '[GWEHAI ▸ REASONING]',
};
