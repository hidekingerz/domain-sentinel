import { sign, verify } from 'hono/jwt';

const TTL = Number(process.env.SESSION_TTL_SECONDS ?? 604_800);
const SECRET = process.env.SESSION_SECRET ?? '';

export const SESSION_COOKIE = 'ds_session';

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

export async function createSessionToken(subject = 'admin'): Promise<string> {
  if (!SECRET) throw new Error('SESSION_SECRET is not set');
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: subject, iat: now, exp: now + TTL }, SECRET);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  if (!SECRET || !token) return null;
  try {
    const payload = (await verify(token, SECRET, 'HS256')) as unknown as SessionPayload;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(isSecure: boolean) {
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Strict' as const,
    path: '/',
    maxAge: TTL,
  };
}
