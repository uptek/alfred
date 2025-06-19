# Shopkeeper Chrome Extension

## Development

### Debugging Chrome Extension Storage

To inspect the extension's storage data:

1. Navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Find "Shopkeeper for Shopify" extension
4. Click on "service worker" or "background page" link
5. In the opened DevTools console, run:

```javascript
// View all storage data
chrome.storage.local.get(null, (data) => console.log(data))

// View specific permission presets
chrome.storage.local.get('shopkeeper:permission-presets', console.log)

// Clear storage (use with caution)
chrome.storage.local.clear(() => console.log('Storage cleared'))
```

### Storage Structure

The extension stores permission presets with the following structure:
- Key: `shopkeeper:permission-presets`
- Value: Object containing an array of preset objects with permissions