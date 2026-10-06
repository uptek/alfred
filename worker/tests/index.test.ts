import { describe, expect, it, spyOn } from 'bun:test';
import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANALYTICS_ACTIONS, TIME_SAVINGS } from '../../utils/analytics-actions';
import worker, { type Env } from '../index';

function setup(DB?: Env['DB']) {
  const inserts: unknown[][] = [];
  const env: Env = {
    DB: DB ?? {
      prepare: () => ({
        bind: (...values: unknown[]) => ({
          run: async () => {
            inserts.push(values);
          }
        })
      })
    }
  };
  const send = async (body: string, init: RequestInit = { method: 'POST' }, path = '/track') => {
    const request = new Request(`https://events.example${path}`, { ...init, body: body || null });
    return worker.fetch(request, env);
  };
  return { inserts, send };
}

const event = { user_id: 'u1', action: 'popup_open', time_saved: 0, version: '2026.10.03', metadata: { a: 1 } };

describe('track worker', () => {
  it('stores a valid event', async () => {
    const { inserts, send } = setup();
    const response = await send(JSON.stringify(event));
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.slice(1)).toEqual(['u1', 'popup_open', 0, '2026.10.03', '{"a":1}']);
  });

  it('drops unknown actions, missing fields and malformed bodies but still returns 200', async () => {
    const { inserts, send } = setup();
    for (const body of [
      JSON.stringify({ ...event, action: 'not_an_action' }),
      JSON.stringify({ ...event, time_saved: '5' }),
      JSON.stringify({ ...event, time_saved: 1.5 }),
      JSON.stringify({ ...event, time_saved: -1 }),
      JSON.stringify({ ...event, time_saved: 9e18 }),
      JSON.stringify({ ...event, time_saved: 2 ** 31 }),
      JSON.stringify({ ...event, metadata: { a: { b: 1 } } }),
      JSON.stringify({ ...event, metadata: [1] }),
      JSON.stringify({ ...event, metadata: 'x' }),
      JSON.stringify({ ...event, metadata: null }),
      JSON.stringify(event).replace('"time_saved":0', '"time_saved":1e999'),
      JSON.stringify({ ...event, user_id: undefined }),
      JSON.stringify({ ...event, user_id: 42 }),
      JSON.stringify({ ...event, user_id: '' }),
      JSON.stringify({ ...event, metadata: { pad: 'x'.repeat(20_000) } }),
      'null',
      '{not json'
    ]) {
      expect((await send(body)).status).toBe(200);
    }
    expect(inserts).toHaveLength(0);
  });

  it('accepts a body at the size cap and drops one a character over', async () => {
    const { inserts, send } = setup();
    const base = JSON.stringify({ ...event, metadata: { pad: '' } }).length;
    const sized = (length: number) => JSON.stringify({ ...event, metadata: { pad: 'x'.repeat(length - base) } });
    await send(sized(16_384));
    await send(sized(16_385));
    expect(inserts).toHaveLength(1);
  });

  it('drops a body whose Content-Length is over the cap without reading it', async () => {
    const { inserts, send } = setup();
    await send(JSON.stringify(event), { method: 'POST', headers: { 'content-length': '16385' } });
    expect(inserts).toHaveLength(0);
  });

  it('stores null for a version that is not a string', async () => {
    const { inserts, send } = setup();
    await send(JSON.stringify({ ...event, version: { v: 1 } }));
    expect(inserts[0]![4]).toBeNull();
  });

  it('accepts every action with the time_saved the extension computes for it', async () => {
    const { inserts, send } = setup();
    const metadata = { page_type: 'product', app_count: 12, count: 340, has_custom_message: true };
    for (const action of ANALYTICS_ACTIONS) {
      const saving = TIME_SAVINGS[action];
      const time_saved = typeof saving === 'function' ? saving(metadata) : saving;
      await send(JSON.stringify({ ...event, action, time_saved, metadata }));
    }
    expect(inserts.map((values) => values[2])).toEqual([...ANALYTICS_ACTIONS]);
  });

  it('logs a failed insert without failing the request', async () => {
    const consoleError = spyOn(console, 'error').mockImplementation(() => {});
    const { send } = setup({
      prepare: () => ({ bind: () => ({ run: () => Promise.reject(new Error('D1 unavailable')) }) })
    });
    try {
      expect((await send(JSON.stringify(event))).status).toBe(200);
      expect(consoleError).toHaveBeenCalledWith('Insert failed:', expect.any(Error));
    } finally {
      consoleError.mockRestore();
    }
  });

  it('logs a synchronous D1 failure such as a missing binding', async () => {
    const consoleError = spyOn(console, 'error').mockImplementation(() => {});
    const { send } = setup({
      prepare: () => {
        throw new TypeError("Cannot read properties of undefined (reading 'prepare')");
      }
    });
    try {
      expect((await send(JSON.stringify(event))).status).toBe(200);
      expect(consoleError).toHaveBeenCalledWith('Insert failed:', expect.any(TypeError));
    } finally {
      consoleError.mockRestore();
    }
  });

  // D1 is SQLite, so bun:sqlite runs the real migrations and the Worker's real INSERT.
  it('writes rows that fit the D1 schema', async () => {
    const db = new Database(':memory:');
    const migrations = join(import.meta.dir, '../migrations');
    for (const file of readdirSync(migrations)
      .filter((f) => f.endsWith('.sql'))
      .sort())
      db.run(readFileSync(join(migrations, file), 'utf8'));
    const { send } = setup({
      prepare: (query) => ({
        bind: (...values) => ({ run: async () => db.prepare(query).run(...(values as SQLQueryBindings[])) })
      })
    });
    await send(JSON.stringify(event));
    await send(JSON.stringify({ user_id: 'u2', action: 'popup_open', time_saved: 5 }));
    const rows = db.query('SELECT * FROM events ORDER BY user_id').all() as Record<string, unknown>[];
    expect(rows).toMatchObject([
      { user_id: 'u1', action: 'popup_open', time_saved: 0, version: '2026.10.03', metadata: '{"a":1}' },
      { user_id: 'u2', action: 'popup_open', time_saved: 5, version: null, metadata: '{}' }
    ]);
    for (const row of rows) {
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row.created_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    }
  });

  it('answers the CORS preflight and 404s other methods and routes', async () => {
    const { send } = setup();
    const preflight = await send('', { method: 'OPTIONS' });
    // CI's post-deploy check requires exactly 200
    expect(preflight.status).toBe(200);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toBe('content-type');
    expect((await send('', { method: 'GET' })).status).toBe(404);
    expect((await send(JSON.stringify(event), { method: 'POST' }, '/other')).status).toBe(404);
  });
});

describe('uninstall route', () => {
  it('stores an uninstall event and redirects to the survey', async () => {
    const { inserts, send } = setup();
    const response = await send('', { method: 'GET' }, '/uninstall?user_id=u1&version=2026.10.07');
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://tally.so/r/zx79O8');
    expect(inserts.map((values) => values.slice(1))).toEqual([['u1', 'uninstall', 0, '2026.10.07', '{}']]);
  });

  it('still redirects to the survey without a user id, storing nothing', async () => {
    const { inserts, send } = setup();
    for (const query of ['', '?version=2026.10.07', '?user_id=&version=2026.10.07']) {
      const response = await send('', { method: 'GET' }, `/uninstall${query}`);
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('https://tally.so/r/zx79O8');
    }
    expect(inserts).toEqual([]);
  });

  it('is the only way to record an uninstall', async () => {
    // Pages can make the extension post any allowlisted action, so /track must not accept this one
    const { inserts, send } = setup();
    await send(JSON.stringify({ ...event, action: 'uninstall', metadata: {} }));
    expect(inserts).toEqual([]);
  });
});
