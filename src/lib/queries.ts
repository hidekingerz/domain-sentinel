import { desc, eq, sql } from 'drizzle-orm';
import {
  checkResults,
  checkRuns,
  db,
  dkimSelectors,
  domains,
  sqlite,
  type CheckResult,
  type CheckRun,
  type DkimSelector,
  type Domain,
} from '../db/client.js';

export interface DomainOverview {
  domain: Domain;
  selectors: DkimSelector[];
  latest: CheckResult[];
  overallStatus: 'pass' | 'warn' | 'fail' | 'error' | 'unknown';
  lastCheckedAt: string | null;
}

// Single grouped query for all domains: latest result per (domain, kind, selector).
// Avoids N+1 and scales with total result count, not per-domain fetch.
interface LatestRow {
  id: number;
  runId: number;
  domainId: number;
  kind: string;
  selector: string | null;
  status: string;
  raw: string | null;
  findingsJson: string;
  errorMessage: string | null;
  checkedAt: string;
}

function fetchLatestResults(): Map<number, CheckResult[]> {
  const rows = sqlite
    .prepare(
      `SELECT cr.id, cr.run_id as runId, cr.domain_id as domainId, cr.kind, cr.selector,
              cr.status, cr.raw, cr.findings_json as findingsJson,
              cr.error_message as errorMessage, cr.checked_at as checkedAt
         FROM check_results cr
         JOIN (
           SELECT domain_id, kind, COALESCE(selector, '') AS sel, MAX(checked_at) AS mx
             FROM check_results
            GROUP BY domain_id, kind, COALESCE(selector, '')
         ) latest
           ON cr.domain_id = latest.domain_id
          AND cr.kind = latest.kind
          AND COALESCE(cr.selector, '') = latest.sel
          AND cr.checked_at = latest.mx`,
    )
    .all() as LatestRow[];

  const byDomain = new Map<number, CheckResult[]>();
  for (const r of rows) {
    const mapped: CheckResult = {
      id: r.id,
      runId: r.runId,
      domainId: r.domainId,
      kind: r.kind,
      selector: r.selector,
      status: r.status,
      raw: r.raw,
      findingsJson: r.findingsJson,
      errorMessage: r.errorMessage,
      checkedAt: r.checkedAt,
    };
    const arr = byDomain.get(r.domainId) ?? [];
    arr.push(mapped);
    byDomain.set(r.domainId, arr);
  }
  for (const arr of byDomain.values()) {
    arr.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return (a.selector ?? '').localeCompare(b.selector ?? '');
    });
  }
  return byDomain;
}

export function listDomainsOverview(): DomainOverview[] {
  const all = db.select().from(domains).orderBy(domains.name).all();
  const selectors = db.select().from(dkimSelectors).all();
  const selectorsByDomain = new Map<number, DkimSelector[]>();
  for (const s of selectors) {
    const arr = selectorsByDomain.get(s.domainId) ?? [];
    arr.push(s);
    selectorsByDomain.set(s.domainId, arr);
  }
  const latestByDomain = fetchLatestResults();

  return all.map((d) => {
    const latest = latestByDomain.get(d.id) ?? [];
    const lastCheckedAt = latest.reduce<string | null>((acc, r) => {
      if (!acc || r.checkedAt > acc) return r.checkedAt;
      return acc;
    }, null);
    return {
      domain: d,
      selectors: selectorsByDomain.get(d.id) ?? [],
      latest,
      overallStatus: summarize(latest),
      lastCheckedAt,
    };
  });
}

export function latestResultsForDomain(domainId: number): CheckResult[] {
  return fetchLatestResults().get(domainId) ?? [];
}

export function summarize(results: CheckResult[]): DomainOverview['overallStatus'] {
  if (results.length === 0) return 'unknown';
  if (results.some((r) => r.status === 'fail')) return 'fail';
  if (results.some((r) => r.status === 'error')) return 'error';
  if (results.some((r) => r.status === 'warn')) return 'warn';
  return 'pass';
}

export function getDomainById(id: number): Domain | undefined {
  return db.select().from(domains).where(eq(domains.id, id)).get();
}

export function historyForDomain(domainId: number, limit = 50): CheckResult[] {
  return db
    .select()
    .from(checkResults)
    .where(eq(checkResults.domainId, domainId))
    .orderBy(desc(checkResults.checkedAt))
    .limit(limit)
    .all();
}

export function listRecentRuns(limit = 20): CheckRun[] {
  return db.select().from(checkRuns).orderBy(desc(checkRuns.startedAt)).limit(limit).all();
}

export function countDomains(): number {
  const row = db.select({ n: sql<number>`count(*)` }).from(domains).get();
  return row?.n ?? 0;
}
