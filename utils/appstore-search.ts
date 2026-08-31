export const SEARCH_RESULTS_PER_PAGE = 24;

/** 1-based index of the first app card on the search results page named by `search` (a query string). */
export function getSearchStartingIndex(search: string): number {
  const page = parseInt(new URLSearchParams(search).get('page') ?? '1', 10);
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  return (safePage - 1) * SEARCH_RESULTS_PER_PAGE + 1;
}
