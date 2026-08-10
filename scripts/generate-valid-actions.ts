import { writeFileSync } from 'node:fs';
import { ANALYTICS_ACTIONS } from '../utils/analytics-actions';

/** Repo-relative path of the generated file the track edge function imports. */
export const GENERATED_PATH = 'supabase/functions/track/valid-actions.gen.ts';

export function renderValidActions(): string {
  const entries = ANALYTICS_ACTIONS.map((action) => `  '${action}'`).join(',\n');
  return [
    '// Generated from utils/analytics-actions.ts by scripts/generate-valid-actions.ts.',
    '// Do not edit; run `bun run track:gen` to regenerate.',
    'export const VALID_ACTIONS = [',
    entries,
    '];',
    ''
  ].join('\n');
}

if (import.meta.main) {
  writeFileSync(new URL(`../${GENERATED_PATH}`, import.meta.url), renderValidActions());
  console.log(`Wrote ${GENERATED_PATH} (${ANALYTICS_ACTIONS.length} actions)`);
}
