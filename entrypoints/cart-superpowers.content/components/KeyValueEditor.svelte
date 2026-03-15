<script lang="ts">
  let {
    entries = $bindable<Array<{ key: string; value: string }>>([]),
    keyPlaceholder = 'Key',
    valuePlaceholder = 'Value',
    disabled = false,
    addLabel = 'Add property',
    onchange,
  }: {
    entries: Array<{ key: string; value: string }>;
    keyPlaceholder?: string;
    valuePlaceholder?: string;
    disabled?: boolean;
    addLabel?: string;
    onchange?: (entries: Array<{ key: string; value: string }>) => void;
  } = $props();

  function addEntry() {
    entries = [...entries, { key: '', value: '' }];
    onchange?.(entries);
  }

  function removeEntry(index: number) {
    entries = entries.filter((_, i) => i !== index);
    onchange?.(entries);
  }

  function handleInput() {
    onchange?.(entries);
  }
</script>

<div class="kv-editor">
  {#each entries as entry, i (i)}
    <div class="kv-row">
      <input
        class="kv-input"
        type="text"
        placeholder={keyPlaceholder}
        bind:value={entry.key}
        oninput={handleInput}
        {disabled}
      />
      <input
        class="kv-input kv-value"
        type="text"
        placeholder={valuePlaceholder}
        bind:value={entry.value}
        oninput={handleInput}
        {disabled}
      />
      <button class="kv-remove" onclick={() => removeEntry(i)} {disabled} title="Remove">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
  {/each}

  {#if entries.length === 0}
    <div class="kv-empty">No properties</div>
  {/if}

  <button class="kv-add" onclick={addEntry} {disabled}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
    {addLabel}
  </button>
</div>

<style>
  .kv-editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .kv-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .kv-input {
    all: unset;
    flex: 1;
    padding: 8px 10px;
    background: var(--cs-bg-secondary);
    border: 1px solid var(--cs-border);
    border-radius: var(--cs-radius-sm);
    color: var(--cs-text-primary);
    font-size: 13px;
    font-family: inherit;
    transition: border-color 200ms, box-shadow 200ms;
  }

  .kv-value {
    flex: 2;
  }

  .kv-input::placeholder {
    color: var(--cs-text-muted);
  }

  .kv-input:focus {
    border-color: var(--cs-accent);
    box-shadow: 0 0 0 3px var(--cs-accent-subtle, rgba(124, 106, 246, 0.08));
  }

  .kv-remove {
    all: unset;
    cursor: pointer;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--cs-radius-sm);
    color: var(--cs-text-muted);
    flex-shrink: 0;
    transition: color 200ms, background 200ms;
  }

  .kv-remove svg {
    width: 14px;
    height: 14px;
  }

  .kv-remove:hover {
    color: var(--cs-danger);
    background: rgba(239, 68, 68, 0.1);
  }

  .kv-empty {
    color: var(--cs-text-muted);
    font-size: 13px;
    font-style: italic;
    padding: 6px 0;
  }

  .kv-add {
    all: unset;
    cursor: pointer;
    color: var(--cs-accent);
    font-size: 13px;
    font-weight: 500;
    padding: 4px 0;
    transition: color 200ms;
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .kv-add svg {
    width: 14px;
    height: 14px;
  }

  .kv-add:hover {
    color: var(--cs-accent-hover);
  }
</style>
