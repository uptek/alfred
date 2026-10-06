import { ANALYTICS_ACTIONS } from '../utils/analytics-actions';

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

const INSERT = 'INSERT INTO events (id, user_id, action, time_saved, version, metadata) VALUES (?, ?, ?, ?, ?, ?)';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/track') {
      return new Response('Not found', { status: 404, headers: CORS });
    }

    const { user_id, action, time_saved, version, metadata = {} } = await readEvent(request);
    if (
      typeof user_id === 'string' &&
      user_id &&
      VALID_ACTIONS.has(action) &&
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
            JSON.stringify(metadata)
          )
          .run();
      } catch (error) {
        console.error('Insert failed:', error);
      }
    }

    // Always succeed: the extension fires and forgets, so an error has nowhere to go
    return Response.json({ success: true }, { headers: CORS });
  }
};

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
