/**
 * Real-MongoDB integration test bootstrap.
 *
 * The in-memory harness (`mongo-memory.ts`) is fast and deterministic and is the
 * default backend for property tests. Integration tests additionally confirm
 * that the same code behaves identically against a *real* MongoDB deployment
 * (e.g. transactional rollback, concurrent atomic increments, TTL indexes).
 *
 * Such a server is only available in environments that provide one, so these
 * tests are opt-in: set `MONGODB_TEST_URI` (preferred) or `MONGODB_URI` to a
 * connection string that points at a replica-set-enabled MongoDB. When neither
 * is set, `describeIntegration` becomes a no-op `describe.skip`, so the suite
 * never fails merely because no database was provisioned.
 *
 * Safety: the configured database is wiped between tests, so the URI MUST point
 * at a disposable test database, never production data.
 */
import { afterAll, afterEach, beforeAll, describe } from 'vitest';
import {
  connectToDatabase,
  disconnectFromDatabase,
  mongoose,
} from '@/lib/db';

/** The real-MongoDB connection string, if one was provided. */
export const INTEGRATION_MONGODB_URI =
  process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI ?? '';

/** Whether a real-MongoDB integration target is configured. */
export const hasIntegrationMongo = INTEGRATION_MONGODB_URI.length > 0;

/**
 * Drop every document from all collections of the connected database.
 */
async function clearIntegrationDatabase(): Promise<void> {
  const { db } = mongoose.connection;
  if (!db) return;
  const collections = await db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

/**
 * Connect to the configured real MongoDB and sync all registered model indexes.
 */
export async function startIntegrationMongo(): Promise<void> {
  if (!hasIntegrationMongo) {
    throw new Error(
      'No real-MongoDB integration target configured (set MONGODB_TEST_URI or MONGODB_URI).',
    );
  }
  await connectToDatabase(INTEGRATION_MONGODB_URI);
  await Promise.all(
    Object.values(mongoose.models).map((m) => m.syncIndexes()),
  );
}

/** Clean up the integration database and close the connection. */
export async function stopIntegrationMongo(): Promise<void> {
  await clearIntegrationDatabase();
  await disconnectFromDatabase();
}

/**
 * Wire the vitest lifecycle for an integration suite: connect before all tests,
 * clear between tests, and disconnect afterward.
 */
export function setupIntegrationMongo(): void {
  beforeAll(async () => {
    await startIntegrationMongo();
  }, 60_000);

  afterEach(async () => {
    await clearIntegrationDatabase();
  });

  afterAll(async () => {
    await stopIntegrationMongo();
  });
}

/**
 * `describe` wrapper that runs the block against a real MongoDB when one is
 * configured and otherwise skips it. Use exactly like `describe`:
 *
 * ```ts
 * describeIntegration('click endpoint (real MongoDB)', () => {
 *   setupIntegrationMongo();
 *   test('...', async () => { ... });
 * });
 * ```
 */
export const describeIntegration: typeof describe.skip = hasIntegrationMongo
  ? (describe as typeof describe.skip)
  : describe.skip;
