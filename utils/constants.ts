// Edge runs the Chrome build, so only the user agent tells them apart
const isEdge = globalThis.navigator?.userAgent?.includes('Edg/') ?? false;
// The store listing of the running build, addressed by extension ID: each store redirects
// to the listing's current slug. The Worker imports this file too and has no
// import.meta.env, hence the optional chain.
export const STORE_URL = import.meta.env?.FIREFOX
  ? 'https://addons.mozilla.org/firefox/addon/alfred@alfredext.com'
  : isEdge
    ? 'https://microsoftedge.microsoft.com/addons/detail/hgekddfpeffpmdobhnimnfhfofonmpbk'
    : 'https://chromewebstore.google.com/detail/jbdcmokdibodbplhjcajgcbmnflcchbi';
// Edge Add-ons shows reviews on the listing page itself
export const STORE_REVIEW_URL = isEdge ? STORE_URL : `${STORE_URL}/reviews`;
export const FEEDBACK_URL = 'https://tally.so/r/nPgYx0';
export const UNINSTALL_SURVEY_URL = 'https://tally.so/r/zx79O8';
