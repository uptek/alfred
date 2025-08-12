import { useEffect, useState } from 'preact/hooks';
import changelogData from '@/changelog.json';
import { PageHeader } from './PageHeader';

interface ChangelogEntry {
  version: string;
  date: string;
  changes: Array<{
    type: 'heading' | 'paragraph' | 'list' | 'image' | 'video' | 'divider';
    content: string | string[];
    alt?: string;
  }>;
}

export function Changelog() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    setEntries(changelogData as ChangelogEntry[]);
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // TODO: Make this dynamic based on the last time the user opened the changelog page
  const isNewEntry = (dateStr: string) => {
    const entryDate = new Date(dateStr);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - entryDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
  };

  const renderChange = (change: ChangelogEntry['changes'][0], index: number) => {
    switch (change.type) {
      case 'heading':
        return <s-heading key={index}>{change.content as string}</s-heading>;

      case 'paragraph':
        return <s-paragraph key={index}>{change.content as string}</s-paragraph>;

      case 'list':
        return (
          <s-unordered-list key={index}>
            {(change.content as string[]).map((item, i) => (
              <s-list-item key={i}>{item}</s-list-item>
            ))}
          </s-unordered-list>
        );

      case 'image':
        return (
          <s-box key={index}>
            <img
              src={change.content as string}
              alt={change.alt || 'Changelog image'}
              style="width: 100%; height: auto; border-radius: 8px;"
            />
          </s-box>
        );

      case 'video':
        return (
          <s-box key={index}>
            <video
              controls
              muted
              playsinline
              src={change.content as string}
              style="width: 100%; height: auto; border-radius: 8px;"
            />
          </s-box>
        );

      case 'divider':
        return <s-divider key={index} color="strong"></s-divider>;

      default:
        return null;
    }
  };

  return (
    <s-stack id="changelog" gap="base">
      <PageHeader title="Changelog" icon="clock" />
      <s-grid gap="base">
        {entries.map((entry, entryIndex) => (
          <s-section key={entryIndex}>
            <s-stack gap="small-200">
              <s-stack gap="none">
                <s-stack direction="inline" alignItems="center" gap="small-200">
                  <s-heading>v{entry.version} – {formatDate(entry.date)}</s-heading>
                  {isNewEntry(entry.date) && entryIndex === 0 && (
                    <s-badge tone="success">New</s-badge>
                  )}
                </s-stack>
                {/* @ts-expect-error - tone is not a valid prop for s-text */}
                <s-text tone="subdued">{formatDate(entry.date)}</s-text>
              </s-stack>
              {entry.changes.map((change, changeIndex) =>
                renderChange(change, changeIndex)
              )}
            </s-stack>
          </s-section>
        ))}
      </s-grid>
    </s-stack>
  );
}
