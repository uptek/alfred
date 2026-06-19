import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Repo root, resolved from this test file's location (entrypoints/popup/tests).
const ROOT = join(import.meta.dir, '..', '..', '..');

/** Pull every single-quoted string literal out of a source slice. */
function literals(source: string, startMarker: string, endMarker: string): string[] {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end === -1) throw new Error(`end marker not found: ${endMarker}`);
  const slice = source.slice(start, end);
  return [...slice.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!).sort();
}

// The client's AnalyticsAction union (utils/analytics.ts) is the set of events
// trackAction() can send. The Supabase edge function (supabase/functions/track)
// only INSERTS events whose action is in VALID_ACTIONS — anything else is
// acknowledged but silently dropped. The two lists must stay identical, or new
// events vanish from remote analytics with no error. This test is the canary.
describe('analytics action allowlist parity', () => {
  it('client AnalyticsAction union matches the server VALID_ACTIONS allowlist', () => {
    const client = literals(readFileSync(join(ROOT, 'utils/analytics.ts'), 'utf8'), 'export type AnalyticsAction', ';');
    const server = literals(
      readFileSync(join(ROOT, 'supabase/functions/track/index.ts'), 'utf8'),
      'const VALID_ACTIONS',
      '];'
    );

    const missingOnServer = client.filter((a) => !server.includes(a));
    const orphanOnServer = server.filter((a) => !client.includes(a));

    expect({ missingOnServer, orphanOnServer }).toEqual({ missingOnServer: [], orphanOnServer: [] });
  });
});
