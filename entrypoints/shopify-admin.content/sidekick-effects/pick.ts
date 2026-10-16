export type HideEffect = 'glass' | 'dust' | 'paper';

/**
 * Picks an effect at random, never the one that played last, so the next hide
 * can't be predicted but never repeats.
 * @param available - Effects this browser can play, at least two.
 */
export function pickEffect(last: HideEffect | null, available: readonly HideEffect[]): HideEffect {
  const pool = available.filter((e) => e !== last);
  return pool[Math.floor(Math.random() * pool.length)]!;
}
