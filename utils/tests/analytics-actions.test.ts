import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANALYTICS_ACTIONS } from '../analytics-actions';

// The Deno edge function can't import extension code, so its VALID_ACTIONS is
// a hand-maintained literal. This test makes client/server drift a CI failure
// instead of silently dropped events (the images_* actions were rejected
// server-side for a whole release before this existed).
describe('analytics action parity', () => {
  it('Supabase track VALID_ACTIONS matches the client action list exactly', () => {
    const source = readFileSync(join(import.meta.dir, '../../supabase/functions/track/index.ts'), 'utf8');
    const block = source.match(/const VALID_ACTIONS = \[([\s\S]*?)\];/);
    expect(block).not.toBeNull();
    const serverActions = [...block![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);

    expect(new Set(serverActions).size).toBe(serverActions.length); // no duplicates
    expect(serverActions.toSorted()).toEqual([...ANALYTICS_ACTIONS].toSorted());
  });
});
