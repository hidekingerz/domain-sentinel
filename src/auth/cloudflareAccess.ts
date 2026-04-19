import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface AccessIdentity {
  sub: string;
  email?: string;
  name?: string;
  devMode: boolean;
}

const DEV_IDENTITY: AccessIdentity = {
  sub: 'dev-local',
  email: 'dev@local',
  name: 'Local Dev',
  devMode: true,
};

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksTeamDomain: string | null = null;

function getJwks(teamDomain: string) {
  if (jwks && jwksTeamDomain === teamDomain) return jwks;
  const url = new URL(`https://${teamDomain}/cdn-cgi/access/certs`);
  jwks = createRemoteJWKSet(url, {
    // JWKS fetched on first use and cached; refreshed when an unknown kid is seen.
    cacheMaxAge: 10 * 60_000,
    cooldownDuration: 30_000,
  });
  jwksTeamDomain = teamDomain;
  return jwks;
}

export function isAccessConfigured(): boolean {
  return !!(process.env.CF_ACCESS_TEAM_DOMAIN && process.env.CF_ACCESS_AUD);
}

export function isDevMode(): boolean {
  return !isAccessConfigured();
}

// Cloudflare Access forwards the identity as either a request header or a cookie.
// Header is authoritative when present.
export function extractAssertion(headerValue?: string, cookieValue?: string): string | null {
  if (headerValue && headerValue.length > 0) return headerValue;
  if (cookieValue && cookieValue.length > 0) return cookieValue;
  return null;
}

export async function verifyAccessJwt(token: string): Promise<AccessIdentity> {
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
  const aud = process.env.CF_ACCESS_AUD;
  if (!teamDomain || !aud) {
    throw new Error('CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD not configured');
  }
  const issuer = `https://${teamDomain}`;
  const keySet = getJwks(teamDomain);
  const { payload } = await jwtVerify(token, keySet, {
    issuer,
    audience: aud,
    algorithms: ['RS256'],
  });
  return toIdentity(payload);
}

function toIdentity(payload: JWTPayload): AccessIdentity {
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  const email = typeof payload.email === 'string' ? payload.email : undefined;
  const name = typeof payload.name === 'string' ? payload.name : undefined;
  if (!sub) throw new Error('Access JWT missing "sub" claim');
  return { sub, email, name, devMode: false };
}

export function devIdentity(): AccessIdentity {
  return DEV_IDENTITY;
}

export function accessLogoutUrl(): string | null {
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
  if (!teamDomain) return null;
  return `https://${teamDomain}/cdn-cgi/access/logout`;
}
