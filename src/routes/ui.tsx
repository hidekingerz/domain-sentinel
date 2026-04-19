import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { isSameOrigin } from '../auth/middleware.js';
import { db, dkimSelectors, domains } from '../db/client.js';
import {
  getDomainById,
  historyForDomain,
  latestResultsForDomain,
  listDomainsOverview,
  listRecentRuns,
} from '../lib/queries.js';
import {
  isValidDkimSelector,
  isValidDomainName,
  normalizeDomainName,
} from '../lib/hostname.js';
import { runCheck } from '../lib/runCheck.js';
import { Layout } from '../ui/Layout.js';
import type { Finding } from '../checkers/types.js';

export const uiRoutes = new Hono();

function StatusBadge({ status }: { status: string }) {
  return <span class={`badge ${status}`}>{status.toUpperCase()}</span>;
}

uiRoutes.get('/', (c) => {
  const overview = listDomainsOverview();
  return c.html(
    <Layout title="Domains">
      <div class="card">
        <div class="card-header">
          <h1>Domains</h1>
          <div class="row-actions">
            <form method="post" action="/check">
              <button type="submit" class="primary">Check all now</button>
            </form>
            <a href="/domains/new"><button type="button">Add domain</button></a>
          </div>
        </div>
      </div>
      <div class="card">
        <table class="t-domains">
          <colgroup>
            <col />
            <col class="col-status" />
            <col />
            <col class="col-checked" />
            <col class="col-action" />
          </colgroup>
          <thead>
            <tr>
              <th>Domain</th>
              <th>Status</th>
              <th>DKIM selectors</th>
              <th>Last checked</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {overview.length === 0 ? (
              <tr>
                <td colspan={5} class="muted">
                  No domains yet. <a href="/domains/new">Add one</a>.
                </td>
              </tr>
            ) : (
              overview.map((o) => (
                <tr>
                  <td>
                    <a href={`/domains/${o.domain.id}`}>{o.domain.name}</a>
                    {!o.domain.enabled ? <span class="muted"> (disabled)</span> : null}
                  </td>
                  <td>
                    <StatusBadge status={o.overallStatus} />
                  </td>
                  <td>
                    {o.selectors.length === 0 ? (
                      <span class="muted">—</span>
                    ) : (
                      o.selectors.map((s) => s.selector).join(', ')
                    )}
                  </td>
                  <td class="muted">{o.lastCheckedAt ?? 'never'}</td>
                  <td>
                    <form method="post" action={`/check/${o.domain.id}`} class="inline-form">
                      <button type="submit">Check</button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Layout>,
  );
});

uiRoutes.get('/domains/new', (c) =>
  c.html(
    <Layout title="Add domain">
      <div class="card card-narrow">
        <h1>Add domain</h1>
        <form method="post" action="/domains">
          <label>
            Domain name
            <input type="text" name="name" required autofocus placeholder="example.com" />
          </label>
          <label>
            DKIM selectors (comma separated, optional)
            <input type="text" name="selectors" placeholder="default, 20230601" />
          </label>
          <div class="row-actions">
            <button type="submit" class="primary">Save</button>
            <a href="/"><button type="button">Cancel</button></a>
          </div>
        </form>
      </div>
    </Layout>,
  ),
);

uiRoutes.post('/domains', async (c) => {
  if (!isSameOrigin(c)) return c.text('bad origin', 403);
  const form = await c.req.parseBody();
  const rawName = typeof form.name === 'string' ? form.name : '';
  const selectorsRaw = typeof form.selectors === 'string' ? form.selectors : '';
  if (!isValidDomainName(rawName)) return c.text('invalid domain name', 400);
  const name = normalizeDomainName(rawName);
  const existing = db.select().from(domains).where(eq(domains.name, name)).all();
  const domainRow = existing[0] ?? db.insert(domains).values({ name }).returning().get();
  if (!domainRow) return c.text('failed to create', 500);
  const selectors = selectorsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const selector of selectors) {
    if (!isValidDkimSelector(selector)) continue;
    const dup = db
      .select()
      .from(dkimSelectors)
      .where(eq(dkimSelectors.domainId, domainRow.id))
      .all()
      .some((s) => s.selector === selector);
    if (!dup) db.insert(dkimSelectors).values({ domainId: domainRow.id, selector }).run();
  }
  return c.redirect(`/domains/${domainRow.id}`);
});

uiRoutes.get('/domains/:id', (c) => {
  const id = Number(c.req.param('id'));
  const domain = getDomainById(id);
  if (!domain) return c.notFound();
  const latest = latestResultsForDomain(id);
  const selectors = db
    .select()
    .from(dkimSelectors)
    .where(eq(dkimSelectors.domainId, id))
    .all();
  const history = historyForDomain(id, 50);

  return c.html(
    <Layout title={domain.name}>
      <div class="card">
        <div class="card-header">
          <h1>{domain.name}</h1>
          <div class="row-actions">
            <form method="post" action={`/check/${domain.id}`}>
              <button type="submit" class="primary">Check now</button>
            </form>
            <form method="post" action={`/domains/${domain.id}/delete`} data-confirm="Delete this domain?">
              <button type="submit">Delete</button>
            </form>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Latest results</h2>
        {latest.length === 0 ? (
          <p class="muted">No results yet. Press "Check now".</p>
        ) : (
          <table class="t-latest">
            <colgroup>
              <col class="col-kind" />
              <col class="col-selector" />
              <col class="col-status" />
              <col />
              <col class="col-checked" />
            </colgroup>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Selector</th>
                <th>Status</th>
                <th>Findings</th>
                <th>Checked</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((r) => {
                const findings = safeFindings(r.findingsJson);
                return (
                  <tr>
                    <td>{r.kind}</td>
                    <td class="muted">{r.selector ?? '—'}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>
                      <ul class="finding-list">
                        {findings.map((f) => (
                          <li class={f.severity === 'fail' ? 'fail' : f.severity === 'warn' ? 'warn' : ''}>
                            <code>{f.code}</code> {f.message}
                            {f.rfcRef ? <span class="muted"> ({f.rfcRef})</span> : null}
                          </li>
                        ))}
                        {r.errorMessage ? <li class="error">error: {r.errorMessage}</li> : null}
                      </ul>
                      {r.raw ? <pre>{r.raw}</pre> : null}
                    </td>
                    <td class="muted">{r.checkedAt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div class="card">
        <h2>DKIM selectors</h2>
        <ul>
          {selectors.map((s) => (
            <li>
              <code>{s.selector}</code>{' '}
              <form method="post" action={`/domains/${domain.id}/selectors/${s.id}/delete`} class="inline-form">
                <button type="submit" class="linklike">remove</button>
              </form>
            </li>
          ))}
        </ul>
        <form method="post" action={`/domains/${domain.id}/selectors`}>
          <label>
            Add selector
            <input type="text" name="selector" required />
          </label>
          <button type="submit">Add</button>
        </form>
      </div>

      <div class="card">
        <h2>History (last 50)</h2>
        <table class="t-history">
          <colgroup>
            <col class="col-checked" />
            <col class="col-kind" />
            <col class="col-selector" />
            <col class="col-status" />
          </colgroup>
          <thead>
            <tr>
              <th>Checked</th>
              <th>Kind</th>
              <th>Selector</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {history.map((r) => (
              <tr>
                <td class="muted">{r.checkedAt}</td>
                <td>{r.kind}</td>
                <td class="muted">{r.selector ?? '—'}</td>
                <td><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>,
  );
});

uiRoutes.post('/domains/:id/delete', (c) => {
  if (!isSameOrigin(c)) return c.text('bad origin', 403);
  const id = Number(c.req.param('id'));
  db.delete(domains).where(eq(domains.id, id)).run();
  return c.redirect('/');
});

uiRoutes.post('/domains/:id/selectors', async (c) => {
  if (!isSameOrigin(c)) return c.text('bad origin', 403);
  const id = Number(c.req.param('id'));
  const form = await c.req.parseBody();
  const selector = typeof form.selector === 'string' ? form.selector.trim() : '';
  if (!isValidDkimSelector(selector)) return c.text('invalid selector', 400);
  const dup = db
    .select()
    .from(dkimSelectors)
    .where(eq(dkimSelectors.domainId, id))
    .all()
    .some((s) => s.selector === selector);
  if (!dup) db.insert(dkimSelectors).values({ domainId: id, selector }).run();
  return c.redirect(`/domains/${id}`);
});

uiRoutes.post('/domains/:id/selectors/:sid/delete', (c) => {
  if (!isSameOrigin(c)) return c.text('bad origin', 403);
  const id = Number(c.req.param('id'));
  const sid = Number(c.req.param('sid'));
  db.delete(dkimSelectors).where(eq(dkimSelectors.id, sid)).run();
  return c.redirect(`/domains/${id}`);
});

uiRoutes.post('/check', async (c) => {
  if (!isSameOrigin(c)) return c.text('bad origin', 403);
  await runCheck({ triggeredBy: 'manual' });
  return c.redirect('/runs');
});

uiRoutes.post('/check/:id', async (c) => {
  if (!isSameOrigin(c)) return c.text('bad origin', 403);
  const id = Number(c.req.param('id'));
  await runCheck({ triggeredBy: 'manual', domainIds: [id] });
  return c.redirect(`/domains/${id}`);
});

uiRoutes.get('/runs', (c) => {
  const runs = listRecentRuns(50);
  return c.html(
    <Layout title="Runs">
      <div class="card">
        <h1>Recent runs</h1>
        <table class="t-runs">
          <colgroup>
            <col class="col-checked" />
            <col class="col-checked" />
            <col class="col-trigger" />
            <col class="col-num" />
            <col class="col-num" />
          </colgroup>
          <thead>
            <tr>
              <th>Started</th>
              <th>Finished</th>
              <th>Trigger</th>
              <th>Domains</th>
              <th>Errors</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr>
                <td>{r.startedAt}</td>
                <td class="muted">{r.finishedAt ?? 'running…'}</td>
                <td>{r.triggeredBy}</td>
                <td>{r.domainCount}</td>
                <td class={r.errorCount > 0 ? 'fail' : 'muted'}>{r.errorCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>,
  );
});

function safeFindings(json: string): Finding[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed as Finding[];
    return [];
  } catch {
    return [];
  }
}
