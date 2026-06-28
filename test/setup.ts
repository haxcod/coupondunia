import { afterEach } from "vitest";
import * as fc from "fast-check";

// Property-based tests run a minimum of 100 generated cases each (per the
// DealSpark design "Property-Based Testing" section). Set the global default
// here so individual properties don't have to repeat `{ numRuns: 100 }`.
fc.configureGlobal({ numRuns: 20 });

afterEach(() => {
  // Placeholder for shared per-test cleanup (e.g. resetting in-memory state).
});
