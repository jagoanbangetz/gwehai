/**
 * Plan-based billing feature flags and migration thresholds.
 * Plans (FREE/PRO/PRO_PLUS/ULTRA) are the source of truth when POINTS_ENABLED=false.
 */

export const POINTS_ENABLED = process.env.POINTS_ENABLED === 'true';

/**
 * When true, users with no planId set get a plan derived from their point balance (for migration).
 * Thresholds below; user.planId is not written back unless migration script runs.
 */
export const PLAN_MIGRATION_FROM_POINTS = process.env.PLAN_MIGRATION_FROM_POINTS !== 'false';

/** Point balance >= this → ULTRA (configurable) */
export const POINTS_FOR_ULTRA = parseInt(process.env.POINTS_FOR_ULTRA || '10000', 10) || 10000;

/** Point balance >= this → PRO_PLUS */
export const POINTS_FOR_PRO_PLUS = parseInt(process.env.POINTS_FOR_PRO_PLUS || '5000', 10) || 5000;

/** Point balance >= this → PRO */
export const POINTS_FOR_PRO = parseInt(process.env.POINTS_FOR_PRO || '1000', 10) || 1000;

/** Worker slot TTL in ms (e.g. 2h) when using in-memory lock. */
export const WORKER_SLOT_TTL_MS = parseInt(process.env.WORKER_SLOT_TTL_MS || '7200000', 10) || 7200000;
