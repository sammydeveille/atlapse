import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { seedGuernica, seedRegistry } from '../src/seed/atlapse.js';

const dir = dirname(fileURLToPath(import.meta.url));
config({ path: join(dir, '../../../.env') });

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST_LOCAL,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

const db = drizzle(pool);

const registry = await seedRegistry(db);
console.log(`Registry: ${registry.kinds} kinds, ${registry.predicates} predicates`);
const sample = await seedGuernica(db);
console.log(`Guernica sample: ${sample.nodes} nodes, ${sample.statements} statements`);

await pool.end();
