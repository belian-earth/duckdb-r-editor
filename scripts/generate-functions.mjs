#!/usr/bin/env node

/**
 * Generate static DuckDB function list for the extension.
 *
 * Usage:
 *   node scripts/generate-functions.mjs                 # base functions only
 *   node scripts/generate-functions.mjs spatial httpfs   # include extensions
 */

import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const duckdb = require('duckdb');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'data', 'duckdb-functions.json');

const extensionNames = process.argv.slice(2);

function query(connection, sql) {
  return new Promise((resolve, reject) => {
    connection.all(sql, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function main() {
  const db = new duckdb.Database(':memory:');
  const conn = db.connect();

  // Load requested extensions
  for (const ext of extensionNames) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(ext)) {
      console.error(`Invalid extension name: "${ext}"`);
      process.exit(1);
    }
    console.log(`Installing and loading extension: ${ext}`);
    await query(conn, `INSTALL ${ext}`);
    await query(conn, `LOAD ${ext}`);
  }

  const rows = await query(conn, `
    SELECT
      function_name,
      function_type,
      description,
      return_type,
      parameters,
      parameter_types
    FROM duckdb_functions()
    ORDER BY function_name
  `);

  // Deduplicate by function_name (keep first occurrence, matching runtime behaviour)
  const seen = new Set();
  const functions = [];
  for (const row of rows) {
    const key = row.function_name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    functions.push({
      function_name: row.function_name,
      function_type: row.function_type,
      description: row.description || '',
      return_type: row.return_type || '',
      parameters: row.parameters || '',
      parameter_types: row.parameter_types || '',
    });
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(functions, null, 2) + '\n');
  console.log(`Wrote ${functions.length} functions to ${OUTPUT_PATH}`);

  conn.close();
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
