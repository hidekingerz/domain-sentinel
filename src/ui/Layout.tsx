import type { FC, PropsWithChildren } from 'hono/jsx';
import type { AccessIdentity } from '../auth/cloudflareAccess.js';

interface LayoutProps {
  title?: string;
  identity?: AccessIdentity;
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({ title, identity, children }) => {
  const heading = title ? `${title} — domain-sentinel` : 'domain-sentinel';
  const who = identity?.email ?? identity?.name ?? identity?.sub;
  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{heading}</title>
        <link rel="stylesheet" href="/assets/app.css" />
        <script src="/assets/app.js" defer></script>
      </head>
      <body>
        <header class="topbar">
          <a href="/" class="brand">
            domain-sentinel
          </a>
          <nav>
            <a href="/">Domains</a>
            <a href="/runs">Runs</a>
            {who ? <span class="muted">{who}</span> : null}
            {identity?.devMode ? <span class="badge warn">DEV</span> : null}
            <a href="/logout">Logout</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
};
