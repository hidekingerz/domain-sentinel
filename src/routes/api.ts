import { Hono } from 'hono';
import { requireCronSecret, requireLoopback } from '../auth/middleware.js';
import { runCheckExclusive } from '../lib/runCheck.js';

// publicApi holds endpoints reachable WITHOUT a session cookie.
// Anything added here is exposed to unauthenticated callers — gate each route
// with its own check (shared secret + loopback-only, etc.).
export const publicApi = new Hono();

publicApi.post('/api/cron/check', async (c) => {
  const loopbackErr = requireLoopback(c);
  if (loopbackErr) return loopbackErr;
  const secretErr = requireCronSecret(c);
  if (secretErr) return secretErr;
  const run = await runCheckExclusive({ triggeredBy: 'cron' });
  return c.json({
    ok: true,
    runId: run.id,
    domainCount: run.domainCount,
    errorCount: run.errorCount,
  });
});
