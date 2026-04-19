import { Hono } from 'hono';
import { requireSession } from './auth/middleware.js';
import { publicApi } from './routes/api.js';
import { authRoutes } from './routes/auth.js';
import { uiRoutes } from './routes/ui.js';
import { APP_JS } from './ui/scripts.js';
import { APP_CSS } from './ui/styles.js';

export const app = new Hono();

// Baseline security headers. Caddy may add more (HSTS), but app-level defense
// in depth keeps these present even when run behind a different proxy.
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
app.route('/', authRoutes); // /login, /logout

// Anything below this line REQUIRES a valid session cookie.
// If you add a new unauthenticated route, register it above, not below.
app.use('*', requireSession);
app.route('/', uiRoutes);
