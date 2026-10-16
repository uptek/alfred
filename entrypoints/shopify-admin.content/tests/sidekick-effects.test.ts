import { afterAll, describe, expect, it, spyOn } from 'bun:test';
import { parseHTML } from 'linkedom';
import { drawEffect, type EffectBag, type HideEffect } from '../sidekick-effects/pick';

const g = globalThis as Record<string, unknown>;
const saved = ['document', 'matchMedia', 'innerWidth', 'innerHeight'].map((k) => [k, g[k]] as const);
const dom = parseHTML('<!doctype html><html><body><div data-sidekick-field>Ask anything...</div></body></html>');
Object.assign(g, { document: dom.document, innerWidth: 1440, innerHeight: 900 });

const messages = await import('~/utils/messages');
const storage = await import('~/utils/storage');
const { disposeHideEffects, playHideEffect } = await import('../sidekick-effects');

const capture = spyOn(messages, 'sendRuntimeMessage');
const spies = [
  capture,
  spyOn(storage, 'getItem').mockResolvedValue(null),
  spyOn(storage, 'setItem').mockResolvedValue()
];

afterAll(() => {
  for (const spy of spies) spy.mockRestore();
  for (const [k, v] of saved) g[k] = v;
});

const bar = dom.document.querySelector<HTMLElement>('[data-sidekick-field]')!;
const reducedMotion = (on: boolean) =>
  (g.matchMedia = (query: string) => ({ matches: on && query.includes('reduce') }));

describe('playHideEffect', () => {
  it('fades the bar out instead when the viewer prefers reduced motion', async () => {
    reducedMotion(true);
    capture.mockClear();
    const played: string[] = [];
    expect(await playHideEffect(bar, (effect) => played.push(effect))).toBe(true);
    expect(played).toEqual(['fade']);
    expect(capture).not.toHaveBeenCalled();
  });

  it('fades the bar out when the tab cannot be captured', async () => {
    reducedMotion(false);
    capture.mockRejectedValue(new Error('Cannot access contents of the page'));
    const played: string[] = [];
    expect(await playHideEffect(bar, (effect) => played.push(effect))).toBe(true);
    expect(played).toEqual(['fade']);
  });

  // Last: teardown is final for the module.
  it('plays nothing once the content script is torn down, even an effect still starting', async () => {
    reducedMotion(false);
    let respond = (_url: unknown) => {};
    capture.mockImplementation(() => new Promise((resolve) => (respond = resolve)));
    const played: string[] = [];
    const result = playHideEffect(bar, (effect) => played.push(effect));
    disposeHideEffects();
    respond(null);
    expect(await result).toBe(false);
    expect(played).toEqual([]);
  });
});

/** Draws `n` effects in a row, carrying the bag from one draw to the next. */
function draws(n: number, available: readonly HideEffect[]): HideEffect[] {
  let bag: EffectBag = { left: [], last: null };
  return Array.from({ length: n }, () => {
    const next = drawEffect(bag, available);
    bag = next.bag;
    return next.effect;
  });
}

describe('drawEffect', () => {
  it('plays every effect once per round and never repeats one back to back', () => {
    const seen = draws(300, ['glass', 'dust', 'paper']);
    for (let i = 0; i < seen.length; i += 3) {
      expect(new Set(seen.slice(i, i + 3))).toEqual(new Set(['glass', 'dust', 'paper']));
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it('skips an effect the browser cannot play, even one already in the bag', () => {
    const first = drawEffect({ left: ['glass', 'dust'], last: 'paper' }, ['dust', 'paper']);
    expect(first.effect).toBe('dust');
    expect(draws(20, ['dust', 'paper']).join(' ')).toMatch(/^(dust paper|paper dust)( \1)*$/);
  });
});
