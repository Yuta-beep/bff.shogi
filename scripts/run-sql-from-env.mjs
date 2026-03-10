#!/usr/bin/env node

import 'dotenv/config';
import fs from 'node:fs/promises';
import { Client } from 'pg';

function parseArgs(argv) {
  let sql = null;
  let file = null;

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--sql' || a === '-c') {
      sql = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (a === '--file' || a === '-f') {
      file = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
  }

  return { sql, file };
}

function usage() {
  console.log(
    `Usage:\n  node scripts/run-sql-from-env.mjs --sql "select now();"\n  node scripts/run-sql-from-env.mjs --file scripts/sql/check-auth-fk.sql`,
  );
}

async function main() {
  const { sql, file } = parseArgs(process.argv);

  if (!sql && !file) {
    usage();
    process.exit(1);
  }
  if (sql && file) {
    console.error('Use either --sql or --file, not both.');
    process.exit(1);
  }

  const connectionString =
    process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error('Missing SUPABASE_DB_URL (or DATABASE_URL/POSTGRES_URL) in .env');
  }

  const query = file ? await fs.readFile(file, 'utf8') : sql;

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const result = await client.query(query);
    if (result.command) {
      console.log(`${result.command}${result.rowCount != null ? ` ${result.rowCount}` : ''}`);
    }
    if (result.rows?.length) {
      console.table(result.rows);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
