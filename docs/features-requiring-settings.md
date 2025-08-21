# Features Requiring Settings in Options Page

This document lists all features in the Alfred for Shopify extension that currently have or should have configurable settings in the options page.

## 1. Theme Customizer

### 1.1 Theme Inspector

**Status**: ✅ Settings Already Implemented
**Current Settings**:

- **Default behavior**: Alfred doesn't interfere with the inspector
- **Disable inspector**: Always disable the theme inspector on page load
- **Restore previous state**: Remember and restore last inspector state

### 1.2 Customizer Resizers

**Status**: ⚠️ Settings Needed
**Recommended Settings**:

- **Individual resizer toggles**: Enable/disable specific resize handles:
  - Primary sidebar resizer (left panel)
  - Secondary sidebar resizer (right panel)
  - Main preview horizontal resizer (width adjustment)
  - Main preview vertical resizer (height adjustment)

## 2. Shortcuts (Right-Click Shortcuts)

### 2.1 Context Menu Items

**Status**: ⚠️ Settings Needed
**Recommended Settings**:

- **Show/Hide individual menu items**: Toggle visibility for each shortcut:
  - Open in Admin
  - Open in Customizer
  - Copy Product JSON
  - Copy Cart JSON
  - Copy Theme Preview URL
  - Clear Cart
  - Open Section in Code Editor

## 3. App Store Features

### 3.1 App Store Search Indexing

**Status**: ⚠️ Settings Needed
**Recommended Settings**:

- **Enable/Disable indexing**: Toggle the numbering of apps in search results

### 3.2 App Store Partner Page Enrichment

**Status**: ⚠️ Settings Needed
**Recommended Settings**:

- **Enable/Disable partner page enrichment**: Toggle enhanced features including table view, sorting, and export options

### 3.3 Collaborator Access Presets

**Status**: ⚠️ Settings Needed
**Recommended Settings**:

- **Enable/Disable presets**: Toggle the collaborator access presets feature

## 4. Developer Tools

### 4.1 JSON Copy Features

**Status**: ⚠️ Settings Needed
**Recommended Settings**:

- **JSON formatting**: Choose between minified or pretty-printed JSON

## Settings UI/UX Recommendations

### Organization

- Group related settings into collapsible sections
- Use tabs for major categories (General, Features, Advanced)
- Implement search functionality for finding specific settings
- Add tooltips with detailed explanations for each setting

### Visual Design

- Use toggle switches for boolean settings
- Use radio buttons for mutually exclusive options
- Use checkboxes for multiple selections
- Include preview/demo areas where applicable
- Maintain consistent spacing and alignment

### User Experience

- Save settings automatically with debouncing
- Show save confirmation with subtle feedback
- Provide "Reset to Default" option for each section
- Include keyboard navigation support
- Add setting change history/undo functionality

### Accessibility

- Ensure all settings are keyboard accessible
- Provide clear labels and descriptions
- Support screen readers with proper ARIA labels
- Include high contrast mode support
- Allow font size adjustments

## Technical Implementation Notes

### Storage Structure

```typescript
interface AlfredSettings {
  // Current structure
  themeCustomizer?: {
    inspector?: "default" | "disable" | "restore";
    resizers?: {
      primarySidebar?: boolean; // Toggle left panel resizer
      secondarySidebar?: boolean; // Toggle right panel resizer
      previewHorizontal?: boolean; // Toggle preview width resizer
      previewVertical?: boolean; // Toggle preview height resizer
    };
  };

  // Proposed additions
  shortcuts?: {
    openInAdmin?: boolean;
    openInCustomizer?: boolean;
    copyProductJson?: boolean;
    copyCartJson?: boolean;
    copyThemePreviewUrl?: boolean;
    clearCart?: boolean;
    openSectionInCodeEditor?: boolean;
  };

  appStore?: {
    searchIndexing?: boolean;
    partnerPageEnrichment?: boolean;
  };

  collaboratorAccess?: boolean;
}
```
