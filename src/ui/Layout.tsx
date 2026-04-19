import type { FC, PropsWithChildren } from 'hono/jsx';

export const Layout: FC<PropsWithChildren<{ title?: string }>> = ({ title, children }) => {
  const heading = title ? `${title} — domain-sentinel` : 'domain-sentinel';
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
            <form method="post" action="/logout">
              <button type="submit" class="linklike">Logout</button>
            </form>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
};
