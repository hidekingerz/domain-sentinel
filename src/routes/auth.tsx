import { getConnInfo } from '@hono/node-server/conninfo';
import bcrypt from 'bcryptjs';
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { isSameOrigin } from '../auth/middleware.js';
import { loginRateLimit, resetLoginRate } from '../auth/rateLimit.js';
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from '../auth/session.js';
import { Layout } from '../ui/Layout.js';

const { compareSync } = bcrypt;

// Pre-computed bcrypt hash used as a decoy when PASSWORD_HASH is unset.
// Keeps compare() timing consistent across "not configured" and "wrong password".
const DUMMY_HASH = '$2a$12$CjwlHswsuzTnJ6zDfHV16u4WkQi4o.G5T.Y7IVoyq2VDmgN4BQbWy';

export const authRoutes = new Hono();

function LoginPage({ error }: { error?: string }) {
  return (
    <Layout title="Login">
      <div class="card card-login">
        <h1>Sign in</h1>
        {error ? <p class="fail">{error}</p> : null}
        <form method="post" action="/login">
          <label>
            Password
            <input type="password" name="password" autofocus required />
          </label>
          <button type="submit">Sign in</button>
        </form>
      </div>
    </Layout>
  );
}

authRoutes.get('/login', (c) => c.html(<LoginPage />));

function clientKey(c: Parameters<typeof isSameOrigin>[0]): string {
  try {
    const info = getConnInfo(c);
    return info.remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

authRoutes.post('/login', async (c) => {
  if (!isSameOrigin(c)) return c.text('bad origin', 403);

  const key = clientKey(c);
  const gate = loginRateLimit(key);
  if (!gate.allowed) {
    c.header('Retry-After', String(Math.ceil(gate.retryAfterMs / 1000)));
    return c.html(<LoginPage error="Too many attempts. Try again later." />, 429);
  }

  const form = await c.req.parseBody();
  const password = typeof form.password === 'string' ? form.password : '';
  const hash = process.env.PASSWORD_HASH || DUMMY_HASH;
  const hashConfigured = !!process.env.PASSWORD_HASH;

  // Always run bcrypt (even when misconfigured or password empty) so timing
  // is independent of the failure mode. Delay is applied AFTER compare.
  const match = compareSync(password, hash);
  await new Promise((r) => setTimeout(r, 300));

  if (!hashConfigured || !match) {
    return c.html(<LoginPage error="Invalid password" />, 401);
  }

  resetLoginRate(key);
  const token = await createSessionToken();
  const proto =
    c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '');
  const isSecure = proto === 'https';
  setCookie(c, SESSION_COOKIE, token, sessionCookieOptions(isSecure));
  return c.redirect('/', 302);
});

authRoutes.post('/logout', (c) => {
  if (!isSameOrigin(c)) return c.text('bad origin', 403);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.redirect('/login', 302);
});
