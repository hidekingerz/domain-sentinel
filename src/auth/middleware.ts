import { timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { getCookie } from 'hono/cookie';
import { SESSION_COOKIE, verifySessionToken } from './session.js';

export const requireSession: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) {
    const accept = c.req.header('accept') ?? '';
    if (accept.includes('text/html')) {
      return c.redirect('/login', 302);
    }
    return c.json({ error: 'unauthorized' }, 401);
  }
  c.set('session', payload);
  await next();
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
