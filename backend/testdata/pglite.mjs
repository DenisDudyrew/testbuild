// Test-only PostgreSQL in WASM memory: no network listener, disk database or user data.
import { PGlite } from '../../node_modules/@electric-sql/pglite/dist/index.js';
import { pgcrypto } from '../../node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js';
import { pg_trgm } from '../../node_modules/@electric-sql/pglite/dist/contrib/pg_trgm.js';
import readline from 'node:readline';
const db = new PGlite({ extensions: { pgcrypto, pg_trgm } });
await db.waitReady;
for await (const line of readline.createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  try {
    const { query, args = [] } = JSON.parse(line);
    const result = args.length ? await db.query(query, args) : (await db.exec(query)).at(-1);
    process.stdout.write(JSON.stringify({ result: result || { rows: [], fields: [], affectedRows: 0 } }) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: { message: error.message, code: error.code || '' } }) + '\n');
  }
}
await db.close();
