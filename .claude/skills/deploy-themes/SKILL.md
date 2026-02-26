---
name: deploy-themes
description: Prune and deploy themes.json to Cloudflare R2 for runtime fetching by the extension
---

## Steps

1. Run the `/prune-themes-json` skill first (if data was freshly scraped)
2. Upload to R2 using the command below
3. Report the upload result

## Upload command

```bash
bunx wrangler r2 object put alfred/themes.json \
  --file assets/data/themes.json \
  --content-type application/json \
  --remote
```

## Important

- The R2 bucket name is `alfred` and the file is served at `https://bucket.alfred.uptek.com/themes.json`
- CORS must be configured on the bucket to allow requests from Chrome extension origins
- The extension caches this file locally with a 24-hour TTL, so updates propagate within a day
- Always prune before deploying to avoid uploading unused fields
