// Renames D1 rows stored under legacy action names (#105), with the same rules
// the track Worker applies to events in flight (utils/analytics-legacy.ts).
// Each row keeps its old name in legacy_action. Safe to re-run: renamed rows no
// longer match any old name.
//
//   bun scripts/backfill-event-names.ts [rows]
//
// Renaming a row writes it and its idx_events_action entry, and D1's daily row
// write limit also has to cover the Worker's inserts (AGENTS.md, Analytics). So
// each run renames at most `rows` legacy rows, oldest first. Run it once per UTC
// day until it reports none left.
//
// Record a restore point before the first run:
//   bunx wrangler d1 time-travel info alfred-events -c worker/wrangler.jsonc
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LEGACY_ACTIONS } from '../utils/analytics-legacy';

// About 70,000 rows written, leaving the rest of the 100,000 for live traffic
const DEFAULT_ROWS = 35_000;

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const jsonPath = (key: string) => literal(`$.${key}`);

/**
 * One UPDATE per rule, in rule order. Each moves its rows off the old name, so the first matching rule wins.
 * @param through - Only rename rows created at or before this ISO timestamp
 */
export function backfillSql(through?: string): string[] {
  return Object.entries(LEGACY_ACTIONS).flatMap(([action, rules]) =>
    rules.map((rule) => {
      let metadata = 'metadata';
      for (const [from, into] of Object.entries(rule.rename ?? {})) {
        // `->` returns JSON text, so json() keeps the value's JSON type
        metadata = `CASE WHEN json_type(${metadata}, ${jsonPath(from)}) IS NULL THEN ${metadata} ELSE json_set(json_remove(${metadata}, ${jsonPath(from)}), ${jsonPath(into)}, json(${metadata} -> ${jsonPath(from)})) END`;
      }
      for (const [key, value] of Object.entries(rule.set ?? {})) {
        metadata = `json_set(${metadata}, ${jsonPath(key)}, ${literal(value)})`;
      }

      const conditions = [`action = ${literal(action)}`];
      if (rule.when?.equals !== undefined) {
        conditions.push(`json_extract(metadata, ${jsonPath(rule.when.key)}) = ${literal(rule.when.equals)}`);
      } else if (rule.when) {
        conditions.push(`json_type(metadata, ${jsonPath(rule.when.key)}) IS NOT NULL`);
      }
      if (through) conditions.push(`created_at <= ${literal(through)}`);

      return `UPDATE events SET legacy_action = action, action = ${literal(rule.to)}, metadata = ${metadata} WHERE ${conditions.join(' AND ')};`;
    })
  );
}

const wrangler = (...args: string[]) =>
  execFileSync(
    'bunx',
    ['wrangler', 'd1', 'execute', 'alfred-events', '--remote', '--config', 'worker/wrangler.jsonc', ...args],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit']
    }
  );

const query = <T>(sql: string): T[] => JSON.parse(wrangler('--json', '--command', sql))[0].results;

if (import.meta.main) {
  const rows = Number(process.argv[2] ?? DEFAULT_ROWS);
  if (!Number.isInteger(rows) || rows < 1) throw new Error(`Not a row count: ${process.argv[2]}`);

  const legacy = `action IN (${Object.keys(LEGACY_ACTIONS).map(literal).join(', ')})`;
  const { remaining } = query<{ remaining: number }>(`SELECT COUNT(*) remaining FROM events WHERE ${legacy}`)[0]!;
  if (!remaining) {
    console.log('No legacy rows left');
    process.exit(0);
  }

  // The created_at of the rows-th oldest legacy row bounds this run
  const through =
    remaining > rows
      ? query<{ created_at: string }>(
          `SELECT created_at FROM events WHERE ${legacy} ORDER BY created_at LIMIT 1 OFFSET ${rows - 1}`
        )[0]!.created_at
      : undefined;

  const file = join(mkdtempSync(join(tmpdir(), 'alfred-backfill-')), 'backfill.sql');
  writeFileSync(file, backfillSql(through).join('\n'));
  process.stdout.write(wrangler('--yes', '--file', file));

  console.log(
    through
      ? `Renamed legacy rows created through ${through}, about ${remaining - rows} left. Run again after 00:00 UTC.`
      : `Renamed the last ${remaining} legacy rows.`
  );
}
