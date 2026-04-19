import { timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { getCookie } from 'hono/cookie';
import {
  devIdentity,
  extractAssertion,
  isDevMode,
  verifyAccessJwt,
  type AccessIdentity,
} from './cloudflareAccess.js';

export const requireAccess: MiddlewareHandler<{ Variables: { identity: AccessIdentity } }> =
  async (c, next) => {
    if (isDevMode()) {
      c.set('identity', devIdentity());
      await next();
      return;
    }
    const header = c.req.header('Cf-Access-Jwt-Assertion');
    const cookie = getCookie(c, 'CF_Authorization');
    const token = extractAssertion(header, cookie);
    if (!token) {
      return c.json({ error: 'missing Cloudflare Access assertion' }, 401);
    }
    try {
      const identity = await verifyAccessJwt(token);
      c.set('identity', identity);
      await next();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'invalid token';
      return c.json({ error: 'invalid Access JWT', detail: message }, 401);
    }
  };

function constantTimeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function requireCronSecret(c: Context): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) return c.json({ error: 'CRON_SECRET not configured' }, 500);
  const header = c.req.header('authorization') ?? '';
  const got = header.replace(/^Bearer\s+/i, '');
  if (!constantTimeEquals(got, expected)) return c.json({ error: 'unauthorized' }, 401);
  return null;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function requireLoopback(c: Context): Response | null {
  try {
    const info = getConnInfo(c);
    const addr = info.remote.address ?? '';
    if (!LOOPBACK.has(addr)) return c.json({ error: 'forbidden' }, 403);
    return null;
  } catch {
    return c.json({ error: 'forbidden' }, 403);
  }
}

// Cloudflare Access already blocks cross-origin state-changing requests at the
// edge, but we keep this as defense in depth for dev-mode and misconfig cases.
export function isSameOrigin(c: Context): boolean {
  const origin = c.req.header('origin');
  const host = c.req.header('host');
  if (!host) return false;
  if (!origin) {
    const referer = c.req.header('referer');
    if (!referer) return true;
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
