<script lang="ts">
  import changelogData from '@/changelog.json';
  import PageHeader from '../PageHeader.svelte';

  interface ChangelogEntry {
    version: string;
    date: string;
    changes: {
      type: 'heading' | 'paragraph' | 'list' | 'image' | 'video' | 'divider';
      content: string | string[];
      alt?: string;
    }[];
  }

  const entries: ChangelogEntry[] = changelogData as ChangelogEntry[];

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function isNewEntry(dateStr: string) {
    const entryDate = new Date(dateStr);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - entryDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
  }
</script>

<s-stack id="changelog" gap="base">
  <PageHeader title="Changelog" icon="clock" />
  <s-grid gap="base">
    {#each entries as entry, entryIndex}
      <s-section>
        <s-stack gap="small-200">
          <s-stack gap="none">
            <s-stack direction="inline" alignItems="center" gap="small-200">
              <s-heading>v{entry.version}</s-heading>
              {#if isNewEntry(entry.date) && entryIndex === 0}
                <s-badge tone="success">New</s-badge>
              {/if}
            </s-stack>
            <s-text>{formatDate(entry.date)}</s-text>
          </s-stack>
          {#each entry.changes as change}
            {#if change.type === 'heading'}
              <s-heading>{change.content}</s-heading>
            {:else if change.type === 'paragraph'}
              <s-paragraph>{change.content}</s-paragraph>
            {:else if change.type === 'list'}
              <s-unordered-list>
                {#each change.content as item}
                  <s-list-item>{item}</s-list-item>
                {/each}
              </s-unordered-list>
            {:else if change.type === 'image'}
              <s-box>
                <img
                  src={change.content}
                  alt={change.alt ?? 'Changelog image'}
                  style="width: 100%; height: auto; border-radius: 8px;"
                />
              </s-box>
            {:else if change.type === 'video'}
              <s-box>
                <video
                  controls
                  playsinline
                  src={change.content}
                  style="width: 100%; height: auto; border-radius: 8px;"
                ></video>
              </s-box>
            {:else if change.type === 'divider'}
              <s-divider color="strong"></s-divider>
            {/if}
          {/each}
        </s-stack>
      </s-section>
    {/each}
  </s-grid>
</s-stack>
