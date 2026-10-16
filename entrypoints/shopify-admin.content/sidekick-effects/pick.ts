export type HideEffect = 'glass' | 'dust' | 'paper';

/** The effects left in the current round, and the one that played last. */
export interface EffectBag {
  left: HideEffect[];
  last: HideEffect | null;
}

/**
 * Takes the next effect from a shuffled bag, so every effect plays once per
 * round, and a new round never opens with the effect that closed the last one.
 * @param available - Effects this browser can play, in no particular order.
 */
export function drawEffect(bag: EffectBag, available: readonly HideEffect[]): { effect: HideEffect; bag: EffectBag } {
  let left = bag.left.filter((e) => available.includes(e));
  if (!left.length) {
    left = [...available];
    for (let i = left.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [left[i], left[j]] = [left[j]!, left[i]!];
    }
    if (left.length > 1 && left[0] === bag.last) left.push(left.shift()!);
  }
  const [effect, ...rest] = left as [HideEffect, ...HideEffect[]];
  return { effect, bag: { left: rest, last: effect } };
}
