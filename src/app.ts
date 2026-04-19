import { Hono } from 'hono';
import { requireAccess } from './auth/middleware.js';
import { isDevMode } from './auth/cloudflareAccess.js';
import { publicApi } from './routes/api.js';
import { sessionRoutes } from './routes/session.js';
import { uiRoutes } from './routes/ui.js';
import { APP_JS } from './ui/scripts.js';
import { APP_CSS } from './ui/styles.js';

export const app = new Hono();

// Baseline security headers. Caddy/Cloudflare may add more (HSTS), but
// app-level defense in depth keeps these present under any fronting proxy.
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'self'; frame-ancestors 'none'",
  );
});

// Public, unauthenticated endpoints.
app.get('/healthz', (c) => c.text('ok'));
app.get('/assets/app.css', (c) => {
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(APP_CSS, 200, { 'Content-Type': 'text/css; charset=utf-8' });
});
app.get('/assets/app.js', (c) => {
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(APP_JS, 200, { 'Content-Type': 'application/javascript; charset=utf-8' });
});
app.route('/', publicApi); // /api/cron/check is gated by Bearer + loopback

// Everything below REQUIRES a valid Cloudflare Access JWT.
// In dev mode (CF_* env vars unset) a synthetic identity is injected.
// If you add a new unauthenticated route, register it above, not below.
app.use('*', requireAccess);
app.route('/', sessionRoutes);
app.route('/', uiRoutes);

if (isDevMode()) {
  console.warn(
    '[domain-sentinel] DEV MODE: Cloudflare Access is NOT configured. ' +
      'All requests are auto-authenticated. Set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD for production.',
  );
}
