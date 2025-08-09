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

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const generateChangelog = async () => {
  try {
    const changelogJsonPath = path.resolve(process.cwd(), 'changelog.json');
    const changelogMdPath = path.resolve(process.cwd(), 'changelog.md');
    const changelogHtmlPath = path.resolve(
      process.cwd(),
      'entrypoints/options/sections/changelog.html'
    );

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

    // Generate changelog.html
    let htmlContent = '<s-stack gap="base">\n';
    htmlContent +=
      '  <s-stack direction="inline" alignItems="center" gap="small-200">\n';
    htmlContent += '    <s-icon type="clock"></s-icon>\n';
    htmlContent += '    <s-heading>Changelog</s-heading>\n';
    htmlContent += '  </s-stack>\n';
    htmlContent += '  <s-grid gap="base">\n';
    changelogData.forEach((entry, index) => {
      htmlContent += '    <s-section>\n';
      htmlContent += '      <s-stack gap="small-200">\n';
      htmlContent += '        <s-stack gap="none">\n';
      htmlContent +=
        '          <s-stack direction="inline" alignItems="center" gap="small-200">\n';
      htmlContent += `            <s-heading color="strong">${formatDate(
        entry.date
      )}</s-heading>\n`;
      if (index === 0) {
        htmlContent += '            <s-badge tone="success">New</s-badge>\n';
      }
      htmlContent += '          </s-stack>\n';
      htmlContent += `          <s-text tone="subdued">v${entry.version}</s-text>\n`;
      htmlContent += '        </s-stack>\n';
      entry.changes.forEach((change) => {
        if (typeof change === 'string') {
          htmlContent += `        <s-paragraph>${change}</s-paragraph>\n`;
        } else {
          switch (change.type) {
            case 'paragraph':
              htmlContent += `        <s-paragraph>${change.content}</s-paragraph>\n`;
              break;
            case 'heading':
              htmlContent += `        <s-heading>${change.content}</s-heading>\n`;
              break;
            case 'list':
              htmlContent += '        <s-unordered-list>\n';
              if (Array.isArray(change.content)) {
                change.content.forEach((item) => {
                  htmlContent += `          <s-list-item>${item}</s-list-item>\n`;
                });
              }
              htmlContent += '        </s-unordered-list>\n';
              break;
            case 'image':
              htmlContent += `        <s-box>\n          <s-image src="${change.content}" alt="${change.alt}" borderRadius="base" inlineSize="auto"></s-image>\n        </s-box>\n`;
              break;
            case 'video':
              let videoTag = '<video controls muted playsinline ';
              if (index === 0) {
                videoTag += 'autoplay loop ';
              }
              videoTag += `src="${change.content}" style="width: 100%; height: auto; border-radius: 8px;"></video>`;
              htmlContent += `        <s-box>\n          ${videoTag}\n        </s-box>\n`;
              break;
            case 'divider':
              htmlContent += '        <s-divider color="strong"></s-divider>\n';
              break;
          }
        }
      });
      htmlContent += '      </s-stack>\n';
      htmlContent += '    </s-section>\n';
      if (index === changelogData.length - 1) {
        htmlContent += '    <s-divider color="strong"></s-divider>\n';
      }
    });
    htmlContent += '  </s-grid>\n';
    htmlContent += '</s-stack>\n';

    await fs.writeFile(changelogHtmlPath, htmlContent);

    console.log('Changelog files generated successfully.');
  } catch (error) {
    console.error('Error generating changelog files:', error);
  }
};

generateChangelog();
