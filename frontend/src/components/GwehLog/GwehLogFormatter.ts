/**
 * GwehLogFormatter – groups events by phase and orders blocks for rendering.
 * Consecutive events with the same phase stay in one block.
 * Output is deterministic: THINKING → EXECUTION → MODULE_LOADER → REASONING.
 */

import type { LogEvent, LogPhase } from './GwehLog.types';
import { LOG_PHASE_ORDER } from './GwehLog.types';

export interface LogBlock {
  phase: LogPhase;
  events: LogEvent[];
}

/**
 * Group events by phase, preserving insertion order within each phase.
 * Only phases that have at least one event are included.
 * Block order: THINKING, EXECUTION, MODULE_LOADER, REASONING.
 */
export function groupEventsByPhase(events: LogEvent[]): LogBlock[] {
  const byPhase = new Map<LogPhase, LogEvent[]>();
  for (const phase of LOG_PHASE_ORDER) {
    byPhase.set(phase, []);
  }
  for (const event of events) {
    const list = byPhase.get(event.phase);
    if (list) list.push(event);
  }
  const blocks: LogBlock[] = [];
  for (const phase of LOG_PHASE_ORDER) {
    const list = byPhase.get(phase)!;
    if (list.length > 0) {
      blocks.push({ phase, events: list });
    }
  }
  return blocks;
}

/** Semantic message helpers – return the message string for common patterns */
export function emitTarget(host: string): string {
  return `Target: ${host}`;
}

export function emitSkill(name: string): string {
  return `Skill Loaded: ${name}`;
}

export function emitChecklist(name: string): string {
  return `Checklist Loaded: ${name}`;
}
