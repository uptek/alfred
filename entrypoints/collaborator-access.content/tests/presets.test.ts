import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { parseHTML } from 'linkedom';

// The permission search and form adapter work on the dashboard's Altair
// permissions tree. linkedom stands in for the page; globals are set before
// the import because utils/toast (a transitive import) extends HTMLElement at
// load. Analytics is spied, not module-mocked, so its own tests stay intact.

const TREE = `
  <form id="collaboration-request-form">
    <div data-controller="permissions-tree" class="altair-card">
      <div class="altair-card__header">
        <button type="button" data-permissions-tree-target="selectAllButton">Select all</button>
      </div>
      <div class="altair-card__content">
        <div id="s-orders">
          <button type="button" data-permissions-tree-target="header" data-section-id="orders"><span class="truncate">Orders</span></button>
          <div data-permissions-tree-target="panel" data-section-id="orders" data-open="false">
            <div>
              <div id="h-abandoned">Abandoned checkouts</div>
              <label id="p-abandoned"><input type="checkbox" name="permissions[]" value="abandoned" data-section-id="orders"><span class="truncate">View abandoned checkouts</span></label>
              <div id="h-drafts">Drafts</div>
              <label id="p-drafts"><input type="checkbox" name="permissions[]" value="drafts" data-section-id="orders" checked><span class="truncate"> Draft orders </span></label>
            </div>
          </div>
        </div>
        <div id="s-products">
          <button type="button" data-permissions-tree-target="header" data-section-id="products"><span class="truncate">Products</span></button>
          <div data-permissions-tree-target="panel" data-section-id="products" data-open="true">
            <div>
              <label id="p-products"><input type="checkbox" name="permissions[]" value="products" data-section-id="products"><span class="truncate">Edit products</span></label>
            </div>
          </div>
        </div>
      </div>
    </div>
  </form>`;

const dom = parseHTML('<!doctype html><html><head></head><body></body></html>');
const { document } = dom;

const g = globalThis as Record<string, unknown>;
const saved = ['document', 'HTMLElement', 'CSS'].map((k) => [k, g[k]] as const);
Object.assign(g, {
  document,
  HTMLElement: dom.HTMLElement,
  CSS: { escape: (value: string) => value }
});

const analytics = await import('~/utils/analytics');
const sendTrackEvent = spyOn(analytics, 'sendTrackEvent').mockImplementation(async () => {});
const { setupPermissionSearch, createAdapter } = await import('../presets');

afterAll(() => {
  sendTrackEvent.mockRestore();
  for (const [k, v] of saved) g[k] = v;
});

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const hidden = (id: string) => $(`#${id}`).classList.contains('alfred-perm-filter-hidden');
const isOpen = (section: string) =>
  $(`[data-permissions-tree-target="panel"][data-section-id="${section}"]`).dataset.open;

beforeEach(() => {
  document.body.innerHTML = TREE;
  document.head.innerHTML = '';
  sendTrackEvent.mockClear();
  // Stands in for the page's Stimulus controller: a header click flips its panel.
  for (const header of document.querySelectorAll<HTMLElement>('[data-permissions-tree-target="header"]')) {
    header.addEventListener('click', () => {
      const panel = $(`[data-permissions-tree-target="panel"][data-section-id="${header.dataset.sectionId}"]`);
      panel.dataset.open = String(panel.dataset.open !== 'true');
    });
  }
});

const search = async (query: string) => {
  const input = $<HTMLInputElement>('.field__input');
  input.value = query;
  input.dispatchEvent(new dom.Event('input'));
  await Bun.sleep(170);
};

describe('setupPermissionSearch', () => {
  it('does nothing on pages without the permissions tree', () => {
    document.body.innerHTML = '<form id="collaboration-request-form"></form>';
    expect(setupPermissionSearch()).toBeNull();
    expect(document.querySelector('style')).toBeNull();
  });

  it('adds an Altair search field in the card and Expand/Collapse all beside Select all', () => {
    setupPermissionSearch();
    const field = $('.altair-card__content').firstElementChild as HTMLElement;
    expect(field.className).toBe('field');
    expect(field.querySelector('.field__control > input.field__input')!.getAttribute('aria-label')).toBe(
      'Search permissions'
    );

    const group = $('[data-permissions-tree-target="selectAllButton"]').parentElement!;
    const buttons = [...group.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Select all', 'Expand all', 'Collapse all']);
    expect(buttons[1]!.className).toBe('altair-button altair-button--plain');

    buttons[1]!.click();
    expect([isOpen('orders'), isOpen('products')]).toEqual(['true', 'true']);
    buttons[2]!.click();
    expect([isOpen('orders'), isOpen('products')]).toEqual(['false', 'false']);
    expect(sendTrackEvent).toHaveBeenCalledWith('collapse_all_permissions');
  });

  it('hides labels, subheadings and sections without matches, then restores them on clear', async () => {
    setupPermissionSearch();

    await search('DRAFT');
    expect(['p-abandoned', 'h-abandoned', 'p-drafts', 'h-drafts', 's-orders', 's-products'].map(hidden)).toEqual([
      true,
      true,
      false,
      false,
      false,
      true
    ]);
    // A collapsed section with a match opens so the match is visible.
    expect(isOpen('orders')).toBe('true');
    expect($('.field').lastElementChild!.textContent).toBe('Showing 1 of 3 permissions');
    expect(sendTrackEvent).toHaveBeenCalledWith('permission_search', {
      query: 'draft',
      results_count: 1,
      total_count: 3
    });

    // Every word must match, across the section name and the label.
    await search('orders abandoned');
    expect(['p-abandoned', 'h-abandoned', 'p-drafts', 'h-drafts'].map(hidden)).toEqual([false, false, true, true]);

    const input = $<HTMLInputElement>('.field__input');
    // Enter would submit the access request form the field sits in
    const enter = Object.assign(new dom.Event('keydown'), { key: 'Enter', preventDefault: mock() });
    input.dispatchEvent(enter);
    expect(enter.preventDefault).toHaveBeenCalled();

    input.dispatchEvent(Object.assign(new dom.Event('keydown'), { key: 'Escape' }));
    expect(input.value).toBe('');
    expect(document.querySelectorAll('.alfred-perm-filter-hidden').length).toBe(0);
    // Sections opened by the search close again; ones the user opened stay.
    expect([isOpen('orders'), isOpen('products')]).toEqual(['false', 'true']);
  });

  it('returns null for a tree without card content, before adding any style or field', () => {
    $('.altair-card__content').remove();
    expect(setupPermissionSearch()).toBeNull();
    expect(document.querySelector('style')).toBeNull();
    expect(document.querySelector('.field')).toBeNull();
    expect($('[data-permissions-tree-target="selectAllButton"]').parentElement!.className).toBe('altair-card__header');
  });

  it('treats a blank query and the clear button as a reset', async () => {
    setupPermissionSearch();
    const [control, count] = [...$('.field').children] as HTMLElement[];
    const clearBtn = control!.querySelector('button')!;

    await search('draft');
    expect([clearBtn.style.display, count!.style.display]).toEqual(['block', 'block']);
    sendTrackEvent.mockClear();
    await search('   ');
    expect(document.querySelectorAll('.alfred-perm-filter-hidden').length).toBe(0);
    expect([clearBtn.style.display, count!.style.display]).toEqual(['none', 'none']);
    expect(isOpen('orders')).toBe('false');
    expect(sendTrackEvent).not.toHaveBeenCalled();

    await search('products');
    clearBtn.click();
    expect($<HTMLInputElement>('.field__input').value).toBe('');
    expect(document.querySelectorAll('.alfred-perm-filter-hidden').length).toBe(0);
  });

  it('still searches a card without a Select all button, adding no Expand/Collapse all', async () => {
    $('[data-permissions-tree-target="selectAllButton"]').remove();
    setupPermissionSearch();
    expect([...document.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Expand all');

    await search('products');
    expect(['s-orders', 's-products'].map(hidden)).toEqual([true, false]);
  });

  it('removes the field and its style on destroy', async () => {
    const controller = setupPermissionSearch()!;
    await search('products');
    controller.destroy();
    expect(document.querySelector('.field')).toBeNull();
    expect(document.querySelector('style')).toBeNull();
    expect(document.querySelectorAll('.alfred-perm-filter-hidden').length).toBe(0);
  });
});

describe('createAdapter', () => {
  it('reads checked permissions with their trimmed label text', () => {
    expect(createAdapter().getCheckedPermissions()).toEqual([{ id: 'drafts', label: 'Draft orders' }]);
  });
});
