import { eq } from 'drizzle-orm';
import {
  checkResults,
  checkRuns,
  db,
  dkimSelectors,
  domains,
  sqlite,
  type CheckRun,
} from '../db/client.js';
import {
  dkimChecker,
  dmarcChecker,
  mxChecker,
  spfChecker,
  type CheckResultValue,
} from '../checkers/index.js';

export interface RunOptions {
  triggeredBy: 'cron' | 'manual';
  domainIds?: number[];
}

let inflight: Promise<CheckRun> | null = null;

// Serializes concurrent runCheck invocations (manual button + cron overlap).
// Callers always go through this wrapper.
export async function runCheckExclusive(options: RunOptions): Promise<CheckRun> {
  while (inflight) {
    try {
      await inflight;
    } catch {
      // previous run failed; continue and start a new one
    }
  }
  const promise = runCheckInner(options).finally(() => {
    if (inflight === promise) inflight = null;
  });
  inflight = promise;
  return promise;
}

async function runCheckInner(options: RunOptions): Promise<CheckRun> {
  const enabled = db.select().from(domains).where(eq(domains.enabled, true)).all();
  const targets = options.domainIds
    ? enabled.filter((d) => options.domainIds!.includes(d.id))
    : enabled;

  const [run] = db
    .insert(checkRuns)
    .values({ triggeredBy: options.triggeredBy, domainCount: targets.length })
    .returning()
    .all();
  if (!run) throw new Error('failed to create check run');

  let errorCount = 0;

  try {
    for (const domain of targets) {
      const selectors = db
        .select()
        .from(dkimSelectors)
        .where(eq(dkimSelectors.domainId, domain.id))
        .all();

      const tasks: Promise<CheckResultValue>[] = [
        spfChecker.check({ domain: domain.name }),
        dmarcChecker.check({ domain: domain.name }),
        mxChecker.check({ domain: domain.name }),
        ...selectors.map((s) => dkimChecker.check({ domain: domain.name, selector: s.selector })),
      ];

      const results = await Promise.all(tasks);

      // Atomic per-domain write so partial data isn't visible to the UI.
      const writeDomainResults = sqlite.transaction(() => {
        for (const result of results) {
          if (result.status === 'error' || result.status === 'fail') errorCount += 1;
          db.insert(checkResults)
            .values({
              runId: run.id,
              domainId: domain.id,
              kind: result.kind,
              selector: result.selector ?? null,
              status: result.status,
              raw: result.raw ?? null,
              findingsJson: JSON.stringify(result.findings),
              errorMessage: result.errorMessage ?? null,
            })
            .run();
        }
      });
      writeDomainResults();
    }
  } finally {
    const finalize = sqlite.transaction(() => {
      db.update(checkRuns)
        .set({ finishedAt: new Date().toISOString(), errorCount })
        .where(eq(checkRuns.id, run.id))
        .run();
    });
    finalize();
  }

  const [updated] = db.select().from(checkRuns).where(eq(checkRuns.id, run.id)).all();
  return updated ?? run;
}

// Back-compat alias: older call sites used `runCheck`.
export { runCheckExclusive as runCheck };
