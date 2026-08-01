/**
 * Mongoose connection singleton.
 *
 * Next.js (dev mode + server components / route handlers) re-evaluates modules
 * across hot reloads and instantiates multiple module scopes. Creating a new
 * Mongoose connection on every invocation would exhaust the database's
 * connection pool. We therefore cache the connection (and the in-flight connect
 * promise) on `globalThis` so the same physical connection is reused across
 * reloads and across the many serverless-style invocations of a single process.
 *
 * The `connectToDatabase()` helper is idempotent: concurrent callers awaiting it
 * before the first connection settles all share the same promise, so we never
 * open more than one connection.
 *
 * Requirements: 9.2/9.3 depend on MongoDB multi-document transactions, which
 * require the server to be a replica set. `withTransaction()` below centralizes
 * the session-scoped transaction pattern used by the Click_Service so the same
 * code path is exercised in tests (in-memory replica set) and production.
 */
import mongoose, { type ClientSession, type Mongoose } from 'mongoose';

interface MongooseCache {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
  /** The URI the cached connection was opened against (guards accidental reuse). */
  uri: string | null;
}

// Reuse a single cache object across hot reloads / module re-evaluations.
const globalForMongoose = globalThis as typeof globalThis & {
  _mongooseCache?: MongooseCache;
};

const cache: MongooseCache =
  globalForMongoose._mongooseCache ??
  (globalForMongoose._mongooseCache = { conn: null, promise: null, uri: null });

/** Resolve the connection string, preferring an explicit argument. */
function resolveUri(explicit?: string): string {
  const uri = explicit ?? process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Provide it via the environment or pass a URI to connectToDatabase().',
    );
  }
  return uri;
}

/**
 * Connect to MongoDB (or return the already-established connection).
 *
 * @param uri Optional explicit connection string. When omitted, `process.env.MONGODB_URI`
 *            is used. Primarily, an explicit URI is supplied by the test harness.
 */
export async function connectToDatabase(uri?: string): Promise<Mongoose> {
  // Fast path: reuse a live connection. When no explicit URI is supplied and we
  // are already connected (e.g. callers like `withTransaction()` that just need
  // *a* connection), return it without requiring MONGODB_URI to be set.
  if (cache.conn && !uri) {
    return cache.conn;
  }

  const targetUri = resolveUri(uri);

  // If we already have a live connection to a *different* URI (e.g. a test
  // harness swapped the target), tear it down before reconnecting.
  if (cache.conn && cache.uri && cache.uri !== targetUri) {
    await disconnectFromDatabase();
  }

  if (cache.conn) {
    return cache.conn;
  }

  if (!cache.promise) {
    cache.uri = targetUri;
    cache.promise = mongoose
      .connect(targetUri, {
        // Fail fast instead of buffering queries when the connection drops; this
        // surfaces transaction/connection errors deterministically in tests.
        bufferCommands: false,
      })
      .then((m) => {
        cache.conn = m;
        return m;
      })
      .catch((err) => {
        // Reset the promise so a later call can retry instead of awaiting a
        // permanently-rejected promise.
        cache.promise = null;
        cache.uri = null;
        throw err;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

/**
 * Close the cached connection and clear the cache. Mainly used by the test
 * harness for teardown, but also safe to call in graceful-shutdown hooks.
 */
export async function disconnectFromDatabase(): Promise<void> {
  if (cache.conn) {
    await cache.conn.disconnect();
  } else if (cache.promise) {
    // A connect is in flight — await it so we don't leak a connection, then close.
    const m = await cache.promise.catch(() => null);
    if (m) await m.disconnect();
  }
  cache.conn = null;
  cache.promise = null;
  cache.uri = null;
}

/**
 * Run `fn` inside a single MongoDB transaction, committing on success and
 * rolling back on any thrown error (Req 9.2/9.3). The session is always ended.
 *
 * `session.withTransaction` additionally handles transient transaction errors
 * (e.g. write conflicts under concurrency) by retrying the callback, which is
 * exactly the behavior the atomic, lossless click-increment property relies on.
 */
export async function withTransaction<T>(
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  await connectToDatabase();
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    // `result` is always assigned because withTransaction awaited the callback
    // at least once before resolving.
    return result!;
  } finally {
    await session.endSession();
  }
}

export { mongoose };
