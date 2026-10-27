import type { TabMessage, ThemeDeleteResponse } from '~/utils/messages';

/**
 * Identifies the Online Store app to admin's app proxy, copied from the request Shopify's own
 * theme list sends to delete a theme. They name Shopify's app rather than the store, so they
 * should hold for every store.
 */
const ONLINE_STORE_HEADERS = {
  'x-online-store-web': '1',
  'x-shopify-app-id': '580111',
  'x-shopify-extension-id': '650f1a14fa979ec5c74d063e968411d4-online_store',
  'x-shopify-instance-id': '1'
};

/** Shopify's own mutation, copied from the theme list's request. */
const THEME_DELETE_MUTATION = `mutation ThemeDeleteLegacy($id: ID!) {
  onlineStoreThemeDelete(id: $id) {
    deletedThemeId
    userErrors {
      field
      message
    }
  }
}`;

interface ThemeDeleteResult {
  data?: {
    onlineStoreThemeDelete?: {
      deletedThemeId?: string | null;
      userErrors?: { message: string }[];
    } | null;
  };
  errors?: { message: string }[];
}

/**
 * The admin's CSRF token, which Shopify requires on every request that changes data. Admin
 * serializes it into the page as `csrfToken` in its `server-data` JSON. Read each time rather
 * than cached, in case admin replaces it. A `csrf-token` meta tag, the usual Rails spot, is the
 * fallback.
 */
const findCsrfToken = (): string | null => {
  const serverData = document.querySelector('script[data-serialized-id="server-data"]')?.textContent;
  if (serverData) {
    try {
      const { csrfToken } = JSON.parse(serverData) as { csrfToken?: unknown };
      if (typeof csrfToken === 'string' && csrfToken) {
        return csrfToken;
      }
    } catch {
      // Not JSON after all; try the meta tag.
    }
  }
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || null;
};

/**
 * Deletes a theme through the same admin endpoint Shopify's theme list uses, with the merchant's
 * own session, so it can do exactly what they could do by hand and nothing more. Shopify refuses
 * to delete the live theme itself.
 * @param themeId - The numeric theme ID.
 */
export const deleteTheme = async (themeId: string): Promise<ThemeDeleteResponse> => {
  const store = /^\/store\/([^/]+)/.exec(window.location.pathname)?.[1];
  if (window.location.hostname !== 'admin.shopify.com' || !store) {
    return { ok: false, error: 'Open your themes on admin.shopify.com to bulk delete.' };
  }
  const csrfToken = findCsrfToken();
  if (!csrfToken) {
    return { ok: false, error: "Couldn't find Shopify's security token on the page. Reload and try again." };
  }

  try {
    const response = await fetch(
      `https://admin.shopify.com/api/app_proxy/${store}?operation=ThemeDeleteLegacy&version=unstable`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
          ...ONLINE_STORE_HEADERS
        },
        body: JSON.stringify({
          operationName: 'ThemeDeleteLegacy',
          variables: { id: `gid://shopify/OnlineStoreTheme/${themeId}` },
          query: THEME_DELETE_MUTATION
        }),
        signal: AbortSignal.timeout(20000)
      }
    );
    if (!response.ok) {
      return { ok: false, error: `Shopify answered ${response.status}` };
    }

    const result = (await response.json()) as ThemeDeleteResult;
    const payload = result.data?.onlineStoreThemeDelete;
    if (payload?.deletedThemeId) {
      return { ok: true };
    }
    return {
      ok: false,
      error: payload?.userErrors?.[0]?.message ?? result.errors?.[0]?.message ?? 'Shopify gave no reason'
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * Answers `delete_theme` requests from the theme list (theme-customizer.content), which runs in
 * Shopify's Online Store iframe and has them relayed here by the background.
 */
export const setupThemeDelete = () => {
  browser.runtime.onMessage.addListener((message: TabMessage, _sender, sendResponse) => {
    if (message.action !== 'delete_theme') {
      return false;
    }
    deleteTheme(message.themeId).then(sendResponse);
    return true;
  });
};
