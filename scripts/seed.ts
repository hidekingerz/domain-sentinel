import { eq } from 'drizzle-orm';
import { db, domains, dkimSelectors, sqlite } from '../src/db/client.js';

const seedData: { name: string; selectors: string[] }[] = [
  { name: 'example.com', selectors: ['default'] },
  { name: 'example.org', selectors: [] },
];

for (const { name, selectors } of seedData) {
  const existing = db.select().from(domains).where(eq(domains.name, name)).all();
  if (existing.length > 0) {
    console.log(`skip ${name}`);
    continue;
  }
  const [row] = db.insert(domains).values({ name }).returning().all();
  if (!row) continue;
  for (const selector of selectors) {
    db.insert(dkimSelectors).values({ domainId: row.id, selector }).run();
  }
  console.log(`added ${name}`);
}

sqlite.close();
