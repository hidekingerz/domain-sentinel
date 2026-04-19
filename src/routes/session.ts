import { Hono } from 'hono';
import { accessLogoutUrl, isDevMode } from '../auth/cloudflareAccess.js';

// Thin router for Access-related session actions.
// Login is handled entirely by Cloudflare Access; we only expose a logout
// redirect that clears the Access session at the edge.
export const sessionRoutes = new Hono();

sessionRoutes.get('/logout', (c) => {
  if (isDevMode()) return c.text('dev mode: nothing to log out of');
  const url = accessLogoutUrl();
  if (!url) return c.text('logout URL not configured', 500);
  return c.redirect(url, 302);
});
