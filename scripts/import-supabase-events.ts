// Copies the Supabase `events` table into the D1 `events` table. Safe to re-run:
// rows keep their Supabase uuid and go in with INSERT OR IGNORE, so a run only
// adds what D1 is missing. Pass an ISO date to skip older rows on catch-up runs.
//
//   bun scripts/import-supabase-events.ts [since]
//
// Needs the Supabase CLI and wrangler logged in to the accounts that own each side.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SUPABASE_PROJECT = 'obrjirdnqoiailhbsnmu';
const PAGE_SIZE = 5000;
const ROWS_PER_INSERT = 100;

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

// Only the normalized ISO string reaches the query, never the raw argument
const sinceDate = new Date(process.argv[2] ?? 0);
if (Number.isNaN(sinceDate.getTime())) throw new Error(`Not a date: ${process.argv[2]}`);
const since = sinceDate.toISOString();

const literal = (value: string | number | null) =>
  value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${value.replaceAll("'", "''")}'`;

function fetchPage(after: Row | undefined): Row[] {
  const cursor = after ? `and (created_at, id) > ('${after.created_at}'::timestamptz, '${after.id}'::uuid)` : '';
  const query = `select id, created_at, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ts,
      user_id, action, time_saved, version, metadata
    from events where created_at >= '${since}'::timestamptz ${cursor}
    order by created_at, id limit ${PAGE_SIZE}`;
  const output = execFileSync(
    'supabase',
    ['db', 'query', '--linked', '--project-ref', SUPABASE_PROJECT, '--workdir', tmp, '-o', 'json', query],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] }
  );
  return JSON.parse(output).rows;
}

// Each page's statements go to disk as it arrives, so memory holds one page at a time
const file = join(tmp, 'import.sql');
let total = 0;
for (let page = fetchPage(undefined); page.length; page = fetchPage(page.at(-1))) {
  for (let i = 0; i < page.length; i += ROWS_PER_INSERT) {
    const values = page
      .slice(i, i + ROWS_PER_INSERT)
      .map((row) =>
        [row.id, row.ts, row.user_id, row.action, row.time_saved, row.version, JSON.stringify(row.metadata ?? {})]
          .map(literal)
          .join(', ')
      );
    appendFileSync(
      file,
      `INSERT OR IGNORE INTO events (id, created_at, user_id, action, time_saved, version, metadata) VALUES\n(${values.join('),\n(')});\n`
    );
  }
  total += page.length;
  console.log(`Fetched ${total} rows (through ${page.at(-1)!.ts})`);
}

if (!total) {
  console.log('Nothing to import');
  process.exit(0);
}

execFileSync(
  'bunx',
  [
    'wrangler',
    'd1',
    'execute',
    'alfred-events',
    '--remote',
    '--yes',
    '--config',
    'worker/wrangler.jsonc',
    '--file',
    file
  ],
  { stdio: 'inherit' }
);
