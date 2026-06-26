const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Pool } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const schema = readFileSync(join(process.cwd(), 'scripts', 'postgres-schema.sql'), 'utf8');
  const pool = new Pool({ connectionString });
  try {
    await pool.query(schema);
    console.log('Postgres schema initialized.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
