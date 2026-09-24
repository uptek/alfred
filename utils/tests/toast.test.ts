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

describe('Toast message rendering', () => {
  it('keeps <br> and any other markup as literal text in default toasts', () => {
    // Preset names from the URL reach toasts, so this is the XSS and spoofing guard.
    const message = 'Preset "<img src=x onerror=alert(1)>" not found<br>Try again';
    Toast.show(message, 'error', 0);
    const text = textOf(toasts()[0]);
    expect(text.children.length).toBe(0);
    expect(text.textContent).toBe(message);
  });

  it('turns <br> into line breaks in announcements but keeps other markup literal', () => {
    Toast.show('Hi <img src=x onerror=alert(1)><br>there', 'success', 0, 'announcement');
    const text = textOf(toasts()[0]);
    expect([...text.children].map((c) => c.tagName)).toEqual(['BR']);
    expect(text.textContent).toBe('Hi <img src=x onerror=alert(1)>there');
  });

  it('accepts self-closing and uppercase <br> forms in announcements', () => {
    Toast.show('a<br/>b<BR />c', 'success', 0, 'announcement');
    const text = textOf(toasts()[0]);
    expect(text.querySelectorAll('br').length).toBe(2);
    expect(text.textContent).toBe('abc');
  });
});

describe('Toast variants', () => {
  it('marks announcement toasts and leaves default toasts unmarked', () => {
    Toast.show('Plain', 'success', 0);
    expect(toasts()[0].classList.contains('alfred-toast--announcement')).toBe(false);

    dom.document.body.innerHTML = '';
    Toast.show('Hello', 'success', 0, 'announcement');
    const [el] = toasts();
    expect(el.classList.contains('alfred-toast--announcement')).toBe(true);
    // duration 0 keeps the announcement up until dismissed
    expect(el.timeout).toBeFalsy();
  });

  it('keeps the announcement variant when it replaces an existing toast', async () => {
    Toast.show('Old', 'success', 0);
    Toast.show('New', 'success', 0, 'announcement');
    await Bun.sleep(150);
    const latest = toasts().find((el) => textOf(el).textContent === 'New');
    expect(latest?.classList.contains('alfred-toast--announcement')).toBe(true);
  });
});
