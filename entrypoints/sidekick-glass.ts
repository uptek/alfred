import { createGlass } from './shopify-admin.content/sidekick-effects/glass';
import type { GlassHost } from './shopify-admin.content/sidekick-effects/shared';

// The background injects this into the admin content script's isolated world, only when the glass effect is
// next, so three.js stays out of the content script bundle. It registers itself for the content script.
export default defineUnlistedScript(() => {
  (globalThis as GlassHost).alfredSidekickGlass ??= createGlass();
});
