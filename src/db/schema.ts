import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const domains = sqliteTable('domains', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  note: text('note'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const dkimSelectors = sqliteTable(
  'dkim_selectors',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    domainId: integer('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    selector: text('selector').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    uniqDomainSelector: uniqueIndex('uniq_domain_selector').on(t.domainId, t.selector),
  }),
);

export const checkRuns = sqliteTable('check_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  triggeredBy: text('triggered_by', { enum: ['cron', 'manual'] }).notNull(),
  startedAt: text('started_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  finishedAt: text('finished_at'),
  domainCount: integer('domain_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
});

// kind: SPF | DMARC | MX | DKIM
// status: pass | warn | fail | error
export const checkResults = sqliteTable('check_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: integer('run_id')
    .notNull()
    .references(() => checkRuns.id, { onDelete: 'cascade' }),
  domainId: integer('domain_id')
    .notNull()
    .references(() => domains.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  selector: text('selector'),
  status: text('status').notNull(),
  raw: text('raw'),
  findingsJson: text('findings_json').notNull().default('[]'),
  errorMessage: text('error_message'),
  checkedAt: text('checked_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type Domain = typeof domains.$inferSelect;
export type DkimSelector = typeof dkimSelectors.$inferSelect;
export type CheckRun = typeof checkRuns.$inferSelect;
export type CheckResult = typeof checkResults.$inferSelect;
