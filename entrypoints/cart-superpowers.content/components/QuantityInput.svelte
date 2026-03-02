<script lang="ts">
  let {
    value = $bindable(1),
    min = 0,
    max = 99,
    disabled = false,
    onchange,
  }: {
    value: number;
    min?: number;
    max?: number;
    disabled?: boolean;
    onchange?: (value: number) => void;
  } = $props();

  let inputValue = $state(String(value));

  // Sync inputValue when value prop changes externally
  $effect(() => {
    inputValue = String(value);
  });

  function clamp(n: number): number {
    return Math.max(min, Math.min(max, n));
  }

  function update(newValue: number) {
    const clamped = clamp(newValue);
    value = clamped;
    inputValue = String(clamped);
    onchange?.(clamped);
  }

  function decrement() {
    update(value - 1);
  }

  function increment() {
    update(value + 1);
  }

  function commit() {
    const parsed = parseInt(inputValue, 10);
    if (isNaN(parsed)) {
      inputValue = String(value);
    } else {
      update(parsed);
    }
  }
</script>

<div class="qty">
  <button class="qty-btn" disabled={disabled || value <= min} onclick={decrement}>&minus;</button>
  <input
    class="qty-input"
    type="number"
    bind:value={inputValue}
    onblur={commit}
    onkeydown={(e) => { if (e.key === 'Enter') commit(); }}
    {disabled}
    {min}
    {max}
  />
  <button class="qty-btn" disabled={disabled || value >= max} onclick={increment}>+</button>
</div>

<style>
  .qty {
    display: inline-flex;
    align-items: center;
    gap: 0;
    border: 1px solid var(--cs-border);
    border-radius: var(--cs-radius-sm);
    overflow: hidden;
  }

  .qty-btn {
    all: unset;
    cursor: pointer;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--cs-bg-tertiary);
    color: var(--cs-text-primary);
    font-size: 14px;
    font-weight: 600;
    transition: background 150ms;
    user-select: none;
  }

  .qty-btn:hover:not(:disabled) {
    background: var(--cs-bg-hover);
  }

  .qty-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .qty-input {
    all: unset;
    width: 40px;
    height: 28px;
    text-align: center;
    font-size: 13px;
    color: var(--cs-text-primary);
    background: var(--cs-bg-secondary);
    border-left: 1px solid var(--cs-border);
    border-right: 1px solid var(--cs-border);
    -moz-appearance: textfield;
  }

  .qty-input::-webkit-inner-spin-button,
  .qty-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .qty-input:focus {
    outline: 2px solid var(--cs-accent);
    outline-offset: -2px;
  }
</style>
