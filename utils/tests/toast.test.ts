import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { parseHTML } from 'linkedom';

// Toast renders into the page DOM, which bun test lacks. linkedom supplies
// one; globals are set before the import because AlfredToast extends
// HTMLElement at module load.
const g = globalThis as Record<string, unknown>;
const saved = ['document', 'HTMLElement', 'customElements', 'requestAnimationFrame'].map((k) => [k, g[k]] as const);
const dom = parseHTML('<!doctype html><html><body></body></html>');
Object.assign(g, {
  document: dom.document,
  HTMLElement: dom.HTMLElement,
  customElements: dom.customElements,
  requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0)
});

const { Toast } = await import('../toast');

afterAll(() => {
  for (const [k, v] of saved) g[k] = v;
});

beforeEach(() => {
  dom.document.body.innerHTML = '';
});

const toasts = () => [...dom.document.querySelectorAll('alfred-toast')] as (HTMLElement & { timeout?: unknown })[];
const textOf = (el: HTMLElement) => el.shadowRoot!.querySelector('.alfred-toast__text')!;

describe('default toasts', () => {
  it('keep <br> and any other markup as literal text and stay unmarked', () => {
    // Preset names from the URL reach toasts, so this is the XSS and spoofing guard.
    const message = 'Preset "<img src=x onerror=alert(1)>" not found<br>Try again';
    Toast.show(message, 'error', 0);
    const [el] = toasts();
    expect(textOf(el).children.length).toBe(0);
    expect(textOf(el).textContent).toBe(message);
    expect(el.classList.contains('alfred-toast--announcement')).toBe(false);
  });
});

describe('announcement toasts', () => {
  it.each([
    ['Hi <img src=x onerror=alert(1)><br>there', 1, 'Hi <img src=x onerror=alert(1)>there'],
    ['a<br/>b<BR />c', 2, 'abc']
  ])('turn the <br> forms in %p into line breaks and keep other markup literal', (message, breaks, text) => {
    Toast.show(message, 'success', 0, 'announcement');
    const [el] = toasts();
    expect([...textOf(el).children].map((c) => c.tagName)).toEqual(Array(breaks).fill('BR'));
    expect(textOf(el).textContent).toBe(text);
    expect(el.classList.contains('alfred-toast--announcement')).toBe(true);
    // duration 0 keeps the announcement up until dismissed
    expect(el.timeout).toBeFalsy();
  });

  it('keep the announcement variant when replacing an existing toast', async () => {
    Toast.show('Old', 'success', 0);
    Toast.show('New', 'success', 0, 'announcement');
    await Bun.sleep(150);
    const latest = toasts().find((el) => textOf(el).textContent === 'New');
    expect(latest?.classList.contains('alfred-toast--announcement')).toBe(true);
  });
});
