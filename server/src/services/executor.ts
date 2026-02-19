/**
 * Executor service — thin facade for backward compatibility.
 *
 * All logic has been moved to `./execution/` sub-modules as part of ADR-081.
 * This file re-exports everything so existing imports continue to work.
 */

export { ExecutorService } from './execution';
export type { ExecutionResult } from './execution';
