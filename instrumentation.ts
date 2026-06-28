/**
 * Next.js server instrumentation (Task 16.1).
 *
 * `register()` is invoked **once** per server instance, before the server
 * accepts requests (see `next/dist/docs/.../instrumentation.md`). We use it to
 * start the application-level Click_Event TTL sweep so the 90-day retention
 * deletion runs on a recurring cadence of at most 24 hours (Req 27.3 / 27.4),
 * complementing the best-effort MongoDB TTL index.
 *
 * Guards:
 *   - **Node runtime only.** `scheduleClickEventTtl` pulls in Mongoose, which
 *     cannot run in the Edge runtime, so we bail out unless
 *     `NEXT_RUNTIME === 'nodejs'`. The dynamic `import()` keeps that node-only
 *     dependency out of any Edge bundle.
 *   - **Build phase skipped.** During `next build` there is no long-lived
 *     server (and usually no database), so we do not start the timer.
 *   - **Database configured.** The first sweep runs immediately; without
 *     `MONGODB_URI` it could only fail, so we skip scheduling when it is absent.
 *   - **Run-once.** A flag on `globalThis` ensures repeated `register()` calls
 *     (dev hot-reload, multiple module evaluations) never start more than one
 *     scheduler.
 */
import type { ClickTtlSchedule } from '@/lib/click-ttl';

const globalForTtl = globalThis as typeof globalThis & {
  _clickTtlSchedule?: ClickTtlSchedule;
};

export async function register(): Promise<void> {
  // Only the Node.js runtime can run the Mongoose-backed sweep.
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  // Never start the recurring job during a production build.
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return;
  }

  // The first sweep runs immediately and needs a database to connect to.
  if (!process.env.MONGODB_URI) {
    console.warn(
      '[instrumentation] MONGODB_URI is not set; skipping Click_Event TTL scheduler.',
    );
    return;
  }

  // Run-once guard across hot reloads / repeated module evaluation.
  if (globalForTtl._clickTtlSchedule) {
    return;
  }

  const { scheduleClickEventTtl } = await import('@/lib/click-ttl');
  globalForTtl._clickTtlSchedule = scheduleClickEventTtl();
  console.log(
    '[instrumentation] Click_Event TTL sweep scheduled (runs at least every 24h).',
  );
}
