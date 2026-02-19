// db.ts — Thin re-export facade for backward compatibility.
// All actual logic has been split into db/ repository modules (ADR-081 Phase 1).
// Existing imports like `import { ... } from './db'` or `from '../db'` still work.
export * from './db/index';
