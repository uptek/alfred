import fs from 'fs/promises';
import path from 'path';

interface Change {
  type: 'paragraph' | 'list' | 'image' | 'video' | 'divider' | 'heading';
  content: string | string[];
  alt?: string;
}

interface ChangelogEntry {
  version: string;
  date: string;
  changes: (string | Change)[];
}

const generateChangelog = async () => {
  try {
    const changelogJsonPath = path.resolve(process.cwd(), 'changelog.json');
    const changelogMdPath = path.resolve(process.cwd(), 'changelog.md');

    const changelogData: ChangelogEntry[] = JSON.parse(
      await fs.readFile(changelogJsonPath, 'utf-8')
    );

    // Generate changelog.md
    let mdContent = '# Changelog\n\n';
    changelogData.forEach((entry, index) => {
      mdContent += `## ${entry.version}\n`;
      mdContent += `@ ${entry.date}\n`;
      entry.changes.forEach((change) => {
        if (typeof change === 'string') {
          mdContent += `- ${change}\n`;
        } else {
          switch (change.type) {
            case 'paragraph':
              mdContent += `${change.content}\n\n`;
              break;
            case 'heading':
              mdContent += `\n### ${change.content}\n`;
              break;
            case 'list':
              if (Array.isArray(change.content)) {
                change.content.forEach((item) => {
                  mdContent += `- ${item}\n`;
                });
              }
              break;
            case 'image':
              mdContent += `![${change.alt}](${change.content})\n`;
              break;
            case 'video':
              if (index === 0) {
                mdContent += `\n<video controls autoplay loop muted playsinline src="${change.content}"></video>\n`;
              } else {
                mdContent += `\n<video controls muted playsinline src="${change.content}"></video>\n`;
              }
              break;
            case 'divider':
              mdContent += '\n---\n';
              break;
          }
        }
      });
      mdContent += '\n';
    });
    await fs.writeFile(changelogMdPath, mdContent.trim());

    console.log('Changelog markdown generated successfully.');
  } catch (error) {
    console.error('Error generating changelog files:', error);
  }
};

generateChangelog();
