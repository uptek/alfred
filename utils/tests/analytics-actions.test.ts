import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANALYTICS_ACTIONS } from '../analytics-actions';
import { GENERATED_PATH } from '../../scripts/generate-valid-actions';

// The Deno edge function imports a VALID_ACTIONS file generated from
// ANALYTICS_ACTIONS (it can't import extension code directly). The file is
// checked in so the function deploys without the generator; this test fails
// when it goes stale, so drift becomes a CI failure instead of silently
// dropped events (the images_* actions were rejected server-side for a whole
// release before this existed). Fix: `bun run track:gen`.
describe('analytics action parity', () => {
  it('generated Supabase VALID_ACTIONS matches the client action list exactly', () => {
    const source = readFileSync(join(import.meta.dir, '../../', GENERATED_PATH), 'utf8');
    const block = source.match(/const VALID_ACTIONS = \[([\s\S]*?)\];/);
    expect(block).not.toBeNull();
    const serverActions = [...block![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);

    expect(new Set(serverActions).size).toBe(serverActions.length); // no duplicates
    expect(serverActions).toEqual([...ANALYTICS_ACTIONS]);
  });
});
