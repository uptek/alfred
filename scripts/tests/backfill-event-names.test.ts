import { beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEGACY_ACTIONS, upgradeLegacyEvent } from '../../utils/analytics-legacy';
import { backfillSql } from '../backfill-event-names';

// D1 is SQLite, so the real migrations and the generated SQL run in bun:sqlite.
let db: Database;
beforeEach(() => {
  db = new Database(':memory:');
  const migrations = join(import.meta.dir, '../../worker/migrations');
  for (const file of readdirSync(migrations)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    db.run(readFileSync(join(migrations, file), 'utf8'));
});

const insert = (id: string, action: string, metadata: Record<string, unknown>) =>
  db.run('INSERT INTO events (id, user_id, action, time_saved, metadata) VALUES (?, ?, ?, 0, ?)', [
    id,
    'u1',
    action,
    JSON.stringify(metadata)
  ]);

const row = (id: string) =>
  db.query('SELECT action, metadata, legacy_action FROM events WHERE id = ?').get(id) as {
    action: string;
    metadata: string;
    legacy_action: string | null;
  };

const backfill = () => {
  for (const statement of backfillSql()) db.run(statement);
};

describe('backfillSql', () => {
  it('renames stored rows exactly as the Worker upgrades events in flight, once', () => {
    // Two rows per rule: its condition met with every renamed key present, and
    // with renamed keys absent. Each carries a boolean that must stay a JSON boolean.
    const fixtures = Object.entries(LEGACY_ACTIONS).flatMap(([action, rules]) =>
      rules.flatMap((rule, i) =>
        [true, false].map((withRenamed) => {
          const metadata: Record<string, unknown> = { flag: true, n: 3 };
          if (rule.when) metadata[rule.when.key] = rule.when.equals ?? 1;
          for (const from of Object.keys(rule.rename ?? {})) {
            if (withRenamed) metadata[from] ??= 'popup';
            else delete metadata[from];
          }
          return { id: `${action}#${i}#${withRenamed}`, action, metadata };
        })
      )
    );
    for (const { id, action, metadata } of fixtures) insert(id, action, metadata);

    for (let run = 0; run < 2; run++) {
      backfill();
      for (const { id, action, metadata } of fixtures) {
        const expected = upgradeLegacyEvent(action, metadata)!;
        expect({ id, ...row(id) }).toEqual({
          id,
          action: expected.action,
          metadata: JSON.stringify(expected.metadata),
          legacy_action: action
        });
      }
    }
  });

  it('turns a manual preset apply into a button trigger and keeps JSON types', () => {
    insert('a', 'apply_preset', { source: 'manual', auto_submit: false, permissions_count: 2 });
    backfill();
    expect(row('a').action).toBe('dev.collaborator_access.preset_apply');
    expect(JSON.parse(row('a').metadata)).toEqual({ trigger: 'button', auto_submit: false, permissions_count: 2 });
  });

  it('leaves rows no rule matches, and rows already renamed, untouched', () => {
    insert('unknown', 'credit_click', { source: 'somewhere_new' });
    insert('current', 'popup.app.open', {});
    backfill();
    expect(row('unknown')).toEqual({
      action: 'credit_click',
      metadata: '{"source":"somewhere_new"}',
      legacy_action: null
    });
    expect(row('current')).toEqual({ action: 'popup.app.open', metadata: '{}', legacy_action: null });
  });

  it('changes nothing when run a second time', () => {
    insert('a', 'review_nudge_show', {});
    insert('b', 'review_nudge_show', { variant: 0 });
    backfill();
    const first = [row('a'), row('b')];
    backfill();
    expect([row('a'), row('b')]).toEqual(first);
    expect(first.map((r) => r.action)).toEqual(['popup.review_prompt.show', 'popup.review_nudge.show']);
  });
});
