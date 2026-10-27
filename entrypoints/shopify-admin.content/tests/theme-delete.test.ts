import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { parseHTML } from 'linkedom';

const { document } = parseHTML('<html><head></head><body></body></html>');

const g = globalThis as Record<string, unknown>;
const saved = ['document', 'window', 'fetch'].map((k) => [k, g[k]] as const);
const location = { hostname: 'admin.shopify.com', pathname: '/store/demo-store/themes' };
let requests: { url: string; init: RequestInit }[] = [];
let respond: () => Response = () => new Response('{}');
Object.assign(g, {
  document,
  window: { location },
  fetch: (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return Promise.resolve(respond());
  }
});

const { deleteTheme } = await import('../theme-delete');

afterAll(() => {
  for (const [k, v] of saved) g[k] = v;
});

const json =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status });

describe('deleteTheme', () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="csrf-token" content="token-123">';
    location.hostname = 'admin.shopify.com';
    location.pathname = '/store/demo-store/themes';
    requests = [];
    respond = json({ data: { onlineStoreThemeDelete: { deletedThemeId: 'gid://shopify/OnlineStoreTheme/42' } } });
  });

  it("sends Shopify's own theme list mutation for the current store, with the page's CSRF token", async () => {
    expect(await deleteTheme('42')).toEqual({ ok: true });

    expect(requests).toHaveLength(1);
    const [{ url, init }] = requests;
    expect(url).toBe('https://admin.shopify.com/api/app_proxy/demo-store?operation=ThemeDeleteLegacy&version=unstable');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('token-123');
    expect((init.headers as Record<string, string>)['x-shopify-app-id']).toBe('580111');
    const body = JSON.parse(init.body as string);
    expect(body.operationName).toBe('ThemeDeleteLegacy');
    expect(body.variables).toEqual({ id: 'gid://shopify/OnlineStoreTheme/42' });
    expect(body.query).toContain('onlineStoreThemeDelete(id: $id)');
  });

  it("reads the CSRF token from admin's serialized server data", async () => {
    // Trimmed from admin.shopify.com's own markup.
    document.head.innerHTML =
      '<script type="text/json" data-serialized-id="server-data">{"documentId":"doc-1","buildVersion":"30603.1.0","csrfToken":"token-456","session":{}}</script>';

    await deleteTheme('42');

    expect((requests[0].init.headers as Record<string, string>)['x-csrf-token']).toBe('token-456');
  });

  it('sends nothing without a CSRF token or outside admin.shopify.com', async () => {
    document.head.innerHTML = '';
    expect(await deleteTheme('42')).toEqual({
      ok: false,
      error: "Couldn't find Shopify's security token on the page. Reload and try again."
    });

    document.head.innerHTML = '<meta name="csrf-token" content="token-123">';
    location.hostname = 'demo-store.myshopify.com';
    location.pathname = '/admin/themes';
    expect((await deleteTheme('42')).ok).toBe(false);

    expect(requests).toEqual([]);
  });

  it("reports Shopify's user error, a GraphQL error, or the HTTP status", async () => {
    respond = json({
      data: { onlineStoreThemeDelete: { deletedThemeId: null, userErrors: [{ message: 'Theme is live' }] } }
    });
    expect(await deleteTheme('42')).toEqual({ ok: false, error: 'Theme is live' });

    respond = json({ errors: [{ message: 'Access denied' }] });
    expect(await deleteTheme('42')).toEqual({ ok: false, error: 'Access denied' });

    respond = json({}, 403);
    expect(await deleteTheme('42')).toEqual({ ok: false, error: 'Shopify answered 403' });
  });
});
