import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GENERATED_PATH, renderValidActions } from '../../scripts/generate-valid-actions';

// The Deno edge function imports a VALID_ACTIONS file generated from
// ANALYTICS_ACTIONS (it can't import extension code directly). The file is
// checked in so the function deploys without the generator; this test fails
// when it goes stale, so drift becomes a CI failure instead of silently
// dropped events (the images_* actions were rejected server-side for a whole
// release before this existed). Fix: `bun run track:gen`.
describe('analytics action parity', () => {
  it('checked-in Supabase VALID_ACTIONS matches the generator output exactly', () => {
    const source = readFileSync(join(import.meta.dir, '../../', GENERATED_PATH), 'utf8');
    expect(source).toBe(renderValidActions());
  });
});
