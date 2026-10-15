// Moves the Supabase `events` table into the D1 `events` table, renaming legacy
// actions as the track Worker does (utils/analytics-legacy.ts). Older builds
// still post to Supabase, so run it again to move what arrived since.
//
//   bun scripts/import-supabase-events.ts [rows]
//
// Rows keep their Supabase uuid as the D1 id, so each page is looked up in D1 by
// id. Missing rows are inserted and looked up again, and only rows found in D1
// are deleted from Supabase.
//
// Each inserted row writes itself and its three index entries, and D1's daily
// row write limit also has to cover the Worker's inserts (AGENTS.md, Analytics).
// So a run inserts at most `rows` rows. Lookups and deletes cost no D1 writes.
//
// Needs the Supabase CLI and wrangler logged in to the accounts that own each side.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { upgradeLegacyEvent } from '../utils/analytics-legacy';

const SUPABASE_PROJECT = 'obrjirdnqoiailhbsnmu';
const PAGE_SIZE = 5000;
// About 80,000 rows written, leaving the rest of the 100,000 for live traffic
const DEFAULT_ROWS = 20_000;
const ROWS_PER_INSERT = 100;
// Keeps each id list under D1's 100 KB statement limit
const IDS_PER_QUERY = 2000;

interface Row {
  id: string;
  created_at: string;
  ts: string;
  user_id: string;
  action: string;
  time_saved: number;
  version: string | null;
  metadata: unknown;
}

// Also the Supabase CLI's workdir, so its .temp state stays out of the repo
const tmp = mkdtempSync(join(tmpdir(), 'alfred-events-'));

const rows = Number(process.argv[2] ?? DEFAULT_ROWS);
if (!Number.isInteger(rows) || rows < 1) throw new Error(`Not a row count: ${process.argv[2]}`);

const literal = (value: string | number | null) =>
  value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${value.replaceAll("'", "''")}'`;

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

function supabase<T>(query: string): T[] {
  const output = execFileSync(
    'supabase',
    ['db', 'query', '--linked', '--project-ref', SUPABASE_PROJECT, '--workdir', tmp, '-o', 'json', query],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] }
  );
  return JSON.parse(output).rows;
}

const wrangler = (...args: string[]) =>
  execFileSync(
    'bunx',
    ['wrangler', 'd1', 'execute', 'alfred-events', '--remote', '--config', 'worker/wrangler.jsonc', ...args],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] }
  );

function fetchPage(after: Row | undefined): Row[] {
  const cursor = after ? `where (created_at, id) > ('${after.created_at}'::timestamptz, '${after.id}'::uuid)` : '';
  return supabase(`select id, created_at, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ts,
      user_id, action, time_saved, version, metadata
    from events ${cursor} order by created_at, id limit ${PAGE_SIZE}`);
}

function inD1(ids: string[]): Set<string> {
  const found = new Set<string>();
  for (const chunk of chunks(ids, IDS_PER_QUERY)) {
    const [result] = JSON.parse(
      wrangler('--json', '--command', `SELECT id FROM events WHERE id IN (${chunk.map(literal).join(', ')})`)
    );
    for (const { id } of result.results) found.add(id);
  }
  return found;
}

function insertIntoD1(page: Row[]) {
  const statements = chunks(page, ROWS_PER_INSERT).map((chunk) => {
    const values = chunk.map((row) => {
      const metadata = row.metadata ?? {};
      const upgraded = upgradeLegacyEvent(row.action, metadata);
      return [
        row.id,
        row.ts,
        row.user_id,
        upgraded?.action ?? row.action,
        row.time_saved,
        row.version,
        JSON.stringify(upgraded?.metadata ?? metadata),
        upgraded ? row.action : null
      ]
        .map(literal)
        .join(', ');
    });
    return `INSERT OR IGNORE INTO events (id, created_at, user_id, action, time_saved, version, metadata, legacy_action) VALUES\n(${values.join('),\n(')});`;
  });
  const file = join(tmp, 'insert.sql');
  writeFileSync(file, statements.join('\n'));
  wrangler('--yes', '--file', file);
}

function deleteFromSupabase(ids: string[]): number {
  let deleted = 0;
  for (const chunk of chunks(ids, IDS_PER_QUERY)) {
    deleted += supabase<{ n: number }>(
      `with gone as (delete from events where id in (${chunk.map(literal).join(', ')}) returning 1) select count(*)::int n from gone`
    )[0]!.n;
  }
  return deleted;
}

let inserted = 0;
let moved = 0;
let last: Row | undefined;
while (inserted < rows) {
  const page = fetchPage(last);
  if (!page.length) break;
  last = page.at(-1);

  const present = inD1(page.map((row) => row.id));
  const missing = page.filter((row) => !present.has(row.id)).slice(0, rows - inserted);
  if (missing.length) {
    insertIntoD1(missing);
    inserted += missing.length;
    for (const id of inD1(missing.map((row) => row.id))) present.add(id);
  }

  moved += deleteFromSupabase([...present]);
  console.log(`Through ${last!.ts}: ${moved} moved, ${inserted} of them inserted`);
}

console.log(
  inserted < rows ? 'Nothing left in Supabase.' : `Stopped at the ${rows}-row budget. Run again after 00:00 UTC.`
);
