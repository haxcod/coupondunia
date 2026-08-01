/**
 * In-memory MongoDB transactional harness.
 *
 * MongoDB multi-document transactions (used by the Click_Service per Req 9.2/9.3)
 * require the server to run as a replica set. `mongodb-memory-server`'s
 * `MongoMemoryReplSet` spins up a single-node replica set entirely in memory, so
 * property tests can exercise the *real* transaction code path (`withTransaction`,
 * atomic `$inc`, rollback on failure) without an external database.
 *
 * Typical usage from a `*.test.ts` file:
 *
 * ```ts
 * import { setupMemoryMongo } from '@/test/harness/mongo-memory';
 *
 * setupMemoryMongo(); // wires beforeAll/afterAll/afterEach lifecycle hooks
 *
 * test('...', async () => { ... });
 * ```
 *
 * Or drive the lifecycle manually with `startMemoryMongo` / `stopMemoryMongo` /
 * `clearDatabase` when you need finer control.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll } from 'vitest';
import {
  connectToDatabase,
  disconnectFromDatabase,
  mongoose,
} from '@/lib/db';

let replSet: MongoMemoryReplSet | null = null;

/**
 * Start an in-memory single-node replica set and connect Mongoose to it.
 * Idempotent: a second call returns the existing connection URI.
 *
 * @returns the connection string of the running in-memory server.
 */
export async function startMemoryMongo(): Promise<string> {
  if (replSet) {
    return replSet.getUri();
  }

  replSet = await MongoMemoryReplSet.create({
    // A single voting member is enough to enable transactions while keeping
    // startup fast.
    replSet: { count: 1 },
  });

  const uri = replSet.getUri();
  await connectToDatabase(uri);
  return uri;
}

/**
 * Disconnect Mongoose and stop the in-memory replica set, freeing all resources.
 */
export async function stopMemoryMongo(): Promise<void> {
  await disconnectFromDatabase();
  if (replSet) {
    await replSet.stop();
    replSet = null;
  }
}

/**
 * Remove all documents from every collection without dropping indexes. This is
 * the fast, index-preserving reset to run between individual tests so each test
 * starts from an empty—but fully indexed—database.
 */
export async function clearDatabase(): Promise<void> {
  const { db } = mongoose.connection;
  if (!db) return;
  const collections = await db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

/**
 * Ensure every registered model's indexes (unique slugs, TTL, text, composite
 * sort indexes) exist on the in-memory database. Call this after the models you
 * rely on have been imported so behaviors that depend on indexes (e.g. unique
 * slug collisions) are exercised faithfully.
 */
export async function syncAllIndexes(): Promise<void> {
  await Promise.all(
    Object.values(mongoose.models).map((m) => m.syncIndexes()),
  );
}

interface SetupOptions {
  /** When true, run `syncAllIndexes()` once after the server starts. */
  syncIndexes?: boolean;
}

/**
 * Convenience wiring of the vitest lifecycle for a test file that needs the
 * in-memory transactional database:
 *
 * - `beforeAll`  → start the replica set + connect (and optionally sync indexes)
 * - `afterEach`  → clear all collections
 * - `afterAll`   → disconnect + stop the server
 *
 * Replica-set startup can be slow on first run (it may download the MongoDB
 * binary), so the `beforeAll` hook is given a generous timeout.
 */
export function setupMemoryMongo(options: SetupOptions = {}): void {
  beforeAll(async () => {
    await startMemoryMongo();
    if (options.syncIndexes) {
      await syncAllIndexes();
    }
  }, 120_000);

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await stopMemoryMongo();
  });
}
