// Renames D1 rows stored under legacy action names (#105), with the same rules
// the track Worker applies to events in flight (utils/analytics-legacy.ts).
// Each row keeps its old name in legacy_action. Safe to re-run: renamed rows no
// longer match any old name.
//
//   bun scripts/backfill-event-names.ts
//
// Record a restore point first:
//   bunx wrangler d1 time-travel info alfred-events -c worker/wrangler.jsonc
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LEGACY_ACTIONS } from '../utils/analytics-legacy';

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const jsonPath = (key: string) => literal(`$.${key}`);

/** One UPDATE per rule, in rule order. Each moves its rows off the old name, so the first matching rule wins. */
export function backfillSql(): string[] {
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

      return `UPDATE events SET legacy_action = action, action = ${literal(rule.to)}, metadata = ${metadata} WHERE ${conditions.join(' AND ')};`;
    })
  );
}

if (import.meta.main) {
  const file = join(mkdtempSync(join(tmpdir(), 'alfred-backfill-')), 'backfill.sql');
  writeFileSync(file, backfillSql().join('\n'));
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
}
