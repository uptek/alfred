import { afterAll, describe, expect, it, spyOn } from 'bun:test';
import { parseHTML } from 'linkedom';
import { pickEffect, type HideEffect } from '../sidekick-effects/pick';

const g = globalThis as Record<string, unknown>;
const saved = ['document', 'matchMedia', 'innerWidth', 'innerHeight'].map((k) => [k, g[k]] as const);
const dom = parseHTML('<!doctype html><html><body><div data-sidekick-field>Ask anything...</div></body></html>');
Object.assign(g, { document: dom.document, innerWidth: 1440, innerHeight: 900 });

const messages = await import('~/utils/messages');
const storage = await import('~/utils/storage');
const { disposeHideEffects, playHideEffect, playMoveEffect } = await import('../sidekick-effects');

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

  it('moves Sidekick without an effect when motion is reduced or the tab cannot be captured', async () => {
    const arrivals: unknown[] = [];
    let landings = 0;
    const move = () =>
      playMoveEffect(
        bar,
        (effect) => (arrivals.push(effect), null),
        () => landings++
      );
    reducedMotion(true);
    capture.mockClear();
    await move();
    expect(capture).not.toHaveBeenCalled();
    reducedMotion(false);
    capture.mockRejectedValue(new Error('Cannot access contents of the page'));
    await move();
    expect(arrivals).toEqual([undefined, undefined]);
    expect(landings).toBe(0);
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

/** Picks `n` effects in a row, each knowing the one before it. */
function picks(n: number, available: readonly HideEffect[]): HideEffect[] {
  const seen: HideEffect[] = [];
  for (let i = 0; i < n; i++) seen.push(pickEffect(seen.at(-1) ?? null, available));
  return seen;
}

describe('pickEffect', () => {
  it('picks at random but never repeats the effect that played last', () => {
    const seen = picks(300, ['glass', 'dust', 'paper']);
    expect(new Set(seen)).toEqual(new Set(['glass', 'dust', 'paper']));
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    // Not a fixed rotation: some effect comes back after just one other.
    expect(seen.some((e, i) => e === seen[i - 2])).toBe(true);
  });

  it('never picks an effect the browser cannot play', () => {
    expect(new Set(picks(50, ['dust', 'paper']))).toEqual(new Set(['dust', 'paper']));
    expect(pickEffect('glass', ['dust', 'paper'])).not.toBe('glass');
  });
});
