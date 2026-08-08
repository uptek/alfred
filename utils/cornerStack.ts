const STACK_ID = 'alfred-corner-stack';

/**
 * Shared fixed container pinned to the page's bottom-right corner. The compare
 * tray and the credit chip render inside it as normal flow items (column,
 * right-aligned), so when one disappears the other settles to the bottom
 * instead of floating at a hardcoded offset. Created on first use by whichever
 * content script needs it; `order` on the children controls stacking (tray
 * always at the bottom).
 */
export function getCornerStack(): HTMLElement {
  let stack = document.getElementById(STACK_ID);
  if (!stack) {
    stack = document.createElement('div');
    stack.id = STACK_ID;
    stack.style.cssText =
      'position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:12px;';
    document.body.append(stack);
  }
  return stack;
}

/** Svelte action: moves the node into the corner stack for its lifetime. */
export function cornerStack(node: HTMLElement) {
  getCornerStack().append(node);
  return {
    destroy() {
      node.remove();
    }
  };
}
