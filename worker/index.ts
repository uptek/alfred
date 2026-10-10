import { ANALYTICS_ACTIONS } from '../utils/analytics-actions';
import { upgradeLegacyEvent } from '../utils/analytics-legacy';
import { UNINSTALL_SURVEY_URL } from '../utils/constants';

// The slice of the Workers runtime this file touches, typed locally so it
// type-checks under the extension's tsconfig without @cloudflare/workers-types.
export interface Env {
  DB: { prepare(query: string): { bind(...values: unknown[]): { run(): Promise<unknown> } } };
}

const VALID_ACTIONS = new Set<string>(ANALYTICS_ACTIONS);

// Real payloads top out around 1.5 KB; anything far past that isn't the extension.
const MAX_BODY_LENGTH = 16_384;

// int4 max: SUM(time_saved) over billions of rows still fits SQLite's int64
const MAX_TIME_SAVED = 2_147_483_647;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type'
};

const INSERT =
  'INSERT INTO events (id, user_id, action, time_saved, version, metadata, legacy_action) VALUES (?, ?, ?, ?, ?, ?, ?)';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const { pathname, searchParams } = new URL(request.url);

    if (request.method === 'POST' && pathname === '/track') {
      const event = await readEvent(request);
      // Builds released before a rename still send the old name; store it under the new one
      const upgraded = VALID_ACTIONS.has(event.action)
        ? null
        : upgradeLegacyEvent(String(event.action), event.metadata);
      const row = { ...event, ...upgraded, legacy_action: upgraded ? event.action : null };
      // Listed actions only. The uninstall action stays off the list, since pages can make the extension post any listed action
      if (VALID_ACTIONS.has(row.action)) await store(env, row);
      // Always succeed: the extension fires and forgets, so an error has nowhere to go
      return Response.json({ success: true }, { headers: CORS });
    }

    // The extension's uninstall URL: Chrome opens it once the extension is gone
    if (request.method === 'GET' && pathname === '/uninstall') {
      await store(env, {
        user_id: searchParams.get('user_id'),
        action: 'system.extension.uninstall',
        time_saved: 0,
        version: searchParams.get('version')
      });
      return Response.redirect(UNINSTALL_SURVEY_URL, 302);
    }

    return new Response('Not found', { status: 404, headers: CORS });
  }
};

// Inserts a well-formed event and drops anything else, logging insert failures
async function store(
  env: Env,
  { user_id, action, time_saved, version, metadata = {}, legacy_action = null }: Record<string, any>
) {
  if (
    typeof user_id === 'string' &&
    user_id &&
    Number.isInteger(time_saved) &&
    time_saved >= 0 &&
    time_saved <= MAX_TIME_SAVED &&
    // Flat metadata keeps every stored row parseable by SQLite's JSON functions
    metadata?.constructor === Object &&
    Object.values(metadata).every((value) => value === null || typeof value !== 'object')
  ) {
    try {
      await env.DB.prepare(INSERT)
        .bind(
          crypto.randomUUID(),
          user_id,
          action,
          time_saved,
          (typeof version === 'string' && version) || null,
          JSON.stringify(metadata),
          legacy_action
        )
        .run();
    } catch (error) {
      console.error('Insert failed:', error);
    }
  }
}

// Oversized and malformed bodies read as an empty event, which fails validation
async function readEvent(request: Request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY_LENGTH) return {};
  const body = await request.text();
  if (body.length > MAX_BODY_LENGTH) return {};
  try {
    return JSON.parse(body) ?? {};
  } catch {
    return {};
  }
}
