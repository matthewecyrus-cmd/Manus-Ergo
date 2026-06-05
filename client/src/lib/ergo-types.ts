/**
 * ergo-types.ts — Legacy compatibility stub.
 *
 * All canonical types and scoring functions now live in ergo-engine.ts.
 * The legacy manual-assessment pages (Reports, Assessments, NewAssessment)
 * have been removed. This stub prevents broken imports if any stale reference
 * is encountered during compilation.
 *
 * Do NOT add new types here.
 */
export type { RiskLevel, CorrectiveAction, TaskProfile, SessionRecord } from './ergo-engine';
