import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, sqlite } from '../src/db/client.js';

migrate(db, { migrationsFolder: './drizzle' });
sqlite.close();
console.log('migrations applied');
