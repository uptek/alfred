// Copies the Supabase `events` table into the D1 `events` table, renaming legacy
// actions as the track Worker does (utils/analytics-legacy.ts). Safe to re-run:
// rows keep their Supabase uuid and go in with INSERT OR IGNORE, so a run only
// adds what D1 is missing. Pass an ISO date to skip older rows on catch-up runs.
//
//   bun scripts/import-supabase-events.ts [since] [rows]
//
// Each row writes itself and its two index entries, and D1's daily row write
// limit also has to cover the Worker's inserts (AGENTS.md, Analytics). So a run
// copies at most `rows` rows, oldest first, and prints the command that resumes
// it. Run it once per UTC day, and not on a day the event-name backfill runs.
//
// Needs the Supabase CLI and wrangler logged in to the accounts that own each side.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { upgradeLegacyEvent } from '../utils/analytics-legacy';

const SUPABASE_PROJECT = 'obrjirdnqoiailhbsnmu';
const PAGE_SIZE = 5000;
// About 60,000 rows written, leaving the rest of the 100,000 for live traffic
const DEFAULT_ROWS = 20_000;
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
const rows = Number(process.argv[3] ?? DEFAULT_ROWS);
if (!Number.isInteger(rows) || rows < 1) throw new Error(`Not a row count: ${process.argv[3]}`);

const literal = (value: string | number | null) =>
  value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${value.replaceAll("'", "''")}'`;

function fetchPage(after: Row | undefined, limit: number): Row[] {
  const cursor = after ? `and (created_at, id) > ('${after.created_at}'::timestamptz, '${after.id}'::uuid)` : '';
  const query = `select id, created_at, to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ts,
      user_id, action, time_saved, version, metadata
    from events where created_at >= '${since}'::timestamptz ${cursor}
    order by created_at, id limit ${limit}`;
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
let last: Row | undefined;
while (total < rows) {
  const page = fetchPage(last, Math.min(PAGE_SIZE, rows - total));
  if (!page.length) break;
  for (let i = 0; i < page.length; i += ROWS_PER_INSERT) {
    const values = page.slice(i, i + ROWS_PER_INSERT).map((row) => {
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
    appendFileSync(
      file,
      `INSERT OR IGNORE INTO events (id, created_at, user_id, action, time_saved, version, metadata, legacy_action) VALUES\n(${values.join('),\n(')});\n`
    );
  }
  total += page.length;
  last = page.at(-1);
  console.log(`Fetched ${total} rows (through ${last!.ts})`);
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

if (total === rows) {
  console.log(`Stopped at the ${rows}-row budget. After 00:00 UTC, resume with:`);
  console.log(`  bun scripts/import-supabase-events.ts ${last!.ts} ${rows}`);
}
