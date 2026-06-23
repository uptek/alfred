<script lang="ts">
  import type { RawSchemaBlock, SchemaEntity } from './utils/types';
  import { analyzeSchema, schemaTypeName } from './utils/schema';
  import SummaryBar from './SummaryBar.svelte';
  import type { SummaryItem } from './SummaryBar.svelte';
  import { trackAction } from '@/utils/analytics';
  import { untrack, onDestroy } from 'svelte';

  let { schema, domain }: { schema: RawSchemaBlock[]; domain: string | null } = $props();

  const siteSlug = $derived(domain?.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '') ?? 'site');

  const analysis = $derived(analyzeSchema(schema));

  let overrides = $state<Map<number, boolean>>(new Map());
  function isOpen(i: number): boolean {
    return overrides.get(i) ?? i === 0;
  }
  function toggle(i: number) {
    const next = new Map(overrides);
    next.set(i, !isOpen(i));
    overrides = next;
  }

  type Row =
    | { kind: 'leaf'; depth: number; label: string; value: string }
    | { kind: 'list'; depth: number; label: string; items: string[] }
    | { kind: 'group'; depth: number; label: string; meta: string };

  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const isScalar = (v: unknown): boolean => v === null || (typeof v !== 'object');
  const isUrl = (v: string): boolean => /^https?:\/\//i.test(v.trim());

  function addRow(label: string, value: unknown, depth: number, rows: Row[]): void {
    if (depth > 20) {
      // Guard against pathological / self-referential nesting blowing the stack.
      rows.push({ kind: 'leaf', depth, label, value: '[nested too deep]' });
      return;
    }
    if (Array.isArray(value)) {
      if (value.every(isScalar)) {
        rows.push({ kind: 'list', depth, label, items: value.map((v) => (v === null ? 'null' : String(v))) });
      } else {
        rows.push({ kind: 'group', depth, label, meta: `${value.length} ${value.length === 1 ? 'item' : 'items'}` });
        value.forEach((item, i) => addRow(String(i + 1), item, depth + 1, rows));
      }
    } else if (isObj(value)) {
      const t = schemaTypeName(value);
      rows.push({ kind: 'group', depth, label, meta: t === 'Unknown' ? 'object' : t });
      for (const [k, v] of Object.entries(value)) {
        if (k === '@context' || k === '@type') continue;
        addRow(k.startsWith('@') ? k.slice(1) : k, v, depth + 1, rows);
      }
    } else {
      rows.push({ kind: 'leaf', depth, label, value: value === null ? 'null' : String(value) });
    }
  }

  function tableRows(data: Record<string, unknown>): Row[] {
    const rows: Row[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (k === '@context' || k === '@type') continue;
      addRow(k.startsWith('@') ? k.slice(1) : k, v, 0, rows);
    }
    return rows;
  }

  let tracked = false;
  $effect(() => {
    const { entities, invalidBlocks } = analysis;
    if (tracked || (entities.length === 0 && invalidBlocks.length === 0)) return;
    tracked = true;
    untrack(() => {
      trackAction('schema_view', {
        blocks: schema.length,
        entities: entities.length,
        invalid: invalidBlocks.length
      });
    });
  });

  const summaryItems = $derived.by(() => {
    const n = analysis.entities.length;
    const items: SummaryItem[] = [{ text: `${n} ${n === 1 ? 'type' : 'types'}` }];
    if (analysis.invalidBlocks.length > 0) {
      items.push({ text: `${analysis.invalidBlocks.length} invalid`, tone: 'err', title: 'Blocks that failed to parse as JSON' });
    }
    return items;
  });

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function copyAll() {
    const text = schema.map((b) => b.raw).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { copied = false; }, 1500);
      trackAction('schema_copy', { scope: 'all', blocks: schema.length });
    } catch {
      // ignore clipboard errors
    }
  }
  function exportJson() {
    const data = analysis.entities.map((e) => e.data);
    downloadFile(JSON.stringify(data, null, 2), `alfred-schema-${siteSlug}.json`, 'application/json');
    trackAction('schema_export', { format: 'json', entities: analysis.entities.length });
  }

  let copiedIndex = $state<number | null>(null);
  let entityTimer: ReturnType<typeof setTimeout> | null = null;
  async function copyEntity(i: number, entity: SchemaEntity) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(entity.data, null, 2));
      copiedIndex = i;
      if (entityTimer) clearTimeout(entityTimer);
      entityTimer = setTimeout(() => { copiedIndex = null; }, 1500);
      trackAction('schema_copy', { scope: 'entity', type: entity.type });
    } catch {
      // ignore clipboard errors
    }
  }

  onDestroy(() => {
    if (copyTimer) clearTimeout(copyTimer);
    if (entityTimer) clearTimeout(entityTimer);
  });
</script>

{#if schema.length === 0}
  <div class="empty-state">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" class="empty-state__icon"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
    <p>No structured data found on this page</p>
  </div>
{:else}
  <div class="schema-tab">
    <div class="toolbar">
      <span class="toolbar__hint">JSON-LD structured data</span>
      <div class="toolbar__actions">
        <button class="toolbar-btn" onclick={copyAll} title={copied ? 'Copied!' : 'Copy all JSON-LD'}>
          {#if copied}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          {/if}
        </button>
        <button class="toolbar-btn" onclick={exportJson} title="Download JSON-LD">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>
    </div>

    <div class="list">
      {#each analysis.entities as entity, i (i)}
        {@const open = isOpen(i)}
        <div class="entity">
          <div class="entity__head">
            <button class="entity__header" class:entity__header--open={open} aria-expanded={open} onclick={() => toggle(i)}>
              <svg class="entity__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              <span class="entity__num">{i + 1}</span>
              <span class="entity__type">{entity.type}</span>
            </button>
            <button
              class="entity__copy"
              class:entity__copy--done={copiedIndex === i}
              title="Copy this type's JSON"
              aria-label="Copy {entity.type} JSON"
              onclick={() => copyEntity(i, entity)}
            >
              {#if copiedIndex === i}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              {/if}
            </button>
          </div>
          {#if open}
            <div class="entity__body">
              <table class="kv">
                <tbody>
                  {#each tableRows(entity.data) as row, idx (idx)}
                    <tr class="kv__row kv__row--{row.kind}">
                      <td class="kv__key" style="padding-left:{row.depth * 16}px">{row.label}</td>
                      <td class="kv__val">
                        {#if row.kind === 'group'}
                          <span class="kv__meta">{row.meta}</span>
                        {:else if row.kind === 'list'}
                          {#each row.items as item, j (j)}
                            <div class="kv__line">
                              {#if isUrl(item)}<a class="kv__url" href={item} target="_blank" rel="noopener noreferrer">{item}</a>{:else if item === ''}<span class="kv__empty">empty</span>{:else}{item}{/if}
                            </div>
                          {/each}
                        {:else if isUrl(row.value)}
                          <a class="kv__url" href={row.value} target="_blank" rel="noopener noreferrer">{row.value}</a>
                        {:else if row.value === ''}
                          <span class="kv__empty">empty</span>
                        {:else}
                          {row.value}
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      {/each}

      {#each analysis.invalidBlocks as bad (bad.blockIndex)}
        <div class="entity entity--invalid">
          <div class="entity__header entity__header--static">
            <span class="entity__type">Block {bad.blockIndex + 1}</span>
            <span class="badge badge--red" title="This block is not valid JSON">invalid JSON</span>
          </div>
          <div class="entity__body">
            <div class="issues">
              <div class="issue issue--error">
                <span class="issue__tag">Parse</span>
                <span class="issue__msg issue__msg--mono">{bad.error}</span>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <SummaryBar items={summaryItems} />
  </div>
{/if}

<style>
  .schema-tab { display: flex; flex-direction: column; height: 100%; animation: fadeUp 0.4s ease both; }

  /* Empty state */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px; color: var(--text-muted); }
  .empty-state__icon { width: 28px; height: 28px; opacity: 0.3; stroke-width: 1.7; }
  .empty-state p { font-size: 13px; margin: 0; }

  /* Toolbar */
  .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .toolbar__hint { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-label); }
  .toolbar__actions { display: flex; align-items: center; gap: 6px; }
  .toolbar-btn { display: flex; align-items: center; gap: 4px; padding: 0 8px; height: 28px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--bg); font-family: inherit; font-size: 11px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: all 0.12s; }
  .toolbar-btn:hover { border-color: var(--border-hover); color: var(--text-secondary); }
  .toolbar-btn svg { width: 13px; height: 13px; stroke-width: 1.8; flex-shrink: 0; }

  /* List */
  .list { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 6px 20px 12px; }
  .list::-webkit-scrollbar { width: 3px; }
  .list::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }

  /* Entity accordion */
  .entity { border-bottom: 1px solid var(--border-muted); }
  .entity:last-child { border-bottom: none; }
  .entity__head { display: flex; align-items: center; }
  .entity__header { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 9px; width: 100%; padding: 13px 0; background: none; border: none; font-family: inherit; text-align: left; cursor: pointer; color: var(--text); }
  .entity__header--static { cursor: default; }

  /* Per-type copy button */
  .entity__copy { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 28px; height: 28px; margin-left: 8px; border: none; border-radius: 6px; background: none; color: var(--text-faint); cursor: pointer; transition: color 0.12s, background 0.12s; }
  .entity__copy:hover { color: var(--text-secondary); background: var(--bg-hover); }
  .entity__copy svg { width: 14px; height: 14px; stroke-width: 1.8; }
  .entity__copy--done, .entity__copy--done:hover { color: var(--success); }
  .entity__chevron { width: 14px; height: 14px; flex-shrink: 0; stroke-width: 2.2; color: var(--text-muted); transition: transform 0.15s; }
  .entity__header--open .entity__chevron { transform: rotate(90deg); }
  .entity__num { font-size: 12px; font-weight: 600; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .entity__type { font-size: 14px; font-weight: 650; letter-spacing: -0.01em; color: var(--text); }
  .entity__header .badge { margin-left: auto; }

  /* Key/value table */
  .entity__body { padding: 0 0 12px; }
  .kv { width: 100%; border-collapse: collapse; table-layout: auto; }
  .kv__row { border-bottom: 1px solid var(--border-subtle); }
  .kv__row:last-child { border-bottom: none; }
  .kv__key {
    width: 1%;
    white-space: nowrap;
    vertical-align: top;
    padding: 7px 16px 7px 0;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .kv__val {
    vertical-align: top;
    padding: 7px 0;
    font-size: 12.5px;
    color: var(--text);
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .kv__row--group .kv__key { color: var(--text); font-weight: 600; }
  .kv__meta { color: var(--text-faint); font-size: 11.5px; }
  .kv__line { padding: 1px 0; }
  .kv__url { color: var(--accent); text-decoration: none; }
  .kv__url:hover { text-decoration: underline; text-underline-offset: 2px; }
  .kv__empty { color: var(--text-disabled); font-style: italic; }

  /* Invalid-JSON callout */
  .issues { margin: 10px -20px 0; display: flex; flex-direction: column; }
  .issue { display: flex; align-items: baseline; gap: 9px; padding: 7px 20px; font-size: 12.5px; border-top: 1px solid var(--border-subtle); }
  .issue--error { background: var(--error-bg); }
  .issue__tag { flex-shrink: 0; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding-top: 1px; }
  .issue--error .issue__tag { color: var(--error-strong); }
  .issue__msg { color: var(--text-secondary); }
  .issue__msg--mono { font-family: 'SF Mono', ui-monospace, monospace; font-size: 11.5px; color: var(--error-strong); }

  .entity--invalid .entity__type { color: var(--error-strong); }

  /* Badge */
  .badge { display: inline-flex; align-items: center; flex-shrink: 0; font-size: 10.5px; font-weight: 600; padding: 1px 8px; border-radius: 20px; white-space: nowrap; }
  .badge--red { background: var(--error-bg); color: var(--error-strong); }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
