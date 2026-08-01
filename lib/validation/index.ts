/**
 * Shared client/server validation schemas for DealSpark (Task 3.1).
 *
 * Single source of truth for form + API validation: the same Zod schemas run on
 * the client (instant feedback, value retention) and on the server
 * (authoritative rejection), and failures are surfaced through the consistent
 * `{ error: { field?, message } }` envelope (see `errors.ts`).
 */
export * from './errors';
export * from './primitives';
export * from './contact';
export * from './category';
export * from './product';
export * from './deal';
export * from './banner';
export * from './settings';
export * from './analytics';
export * from './search';
export * from './click';
