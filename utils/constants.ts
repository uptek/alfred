// The store listing of the running build. The Worker imports this file too and has no
// import.meta.env, hence the optional chain.
export const STORE_URL = import.meta.env?.FIREFOX
  ? 'https://addons.mozilla.org/firefox/addon/alfred-for-shopify'
  : 'https://chromewebstore.google.com/detail/jbdcmokdibodbplhjcajgcbmnflcchbi';
export const STORE_REVIEW_URL = `${STORE_URL}/reviews`;
export const FEEDBACK_URL = 'https://tally.so/r/nPgYx0';
export const UNINSTALL_SURVEY_URL = 'https://tally.so/r/zx79O8';
