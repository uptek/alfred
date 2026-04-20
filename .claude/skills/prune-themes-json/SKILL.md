---
name: prune-themes-json
description: Prune assets/data/themes.json to only fields used by ThemeStoreEntry type after fresh scraped data is imported
---

## Steps

1. Read the `ThemeStoreEntry` interface from `entrypoints/popup/types.ts` to confirm the current fields
2. Run the pruning script below
3. Report how many themes were pruned

## Pruning script

```bash
python3 -c "
import json

data = json.load(open('assets/data/themes.json'))

pruned = []
for t in data:
    pruned.append({
        'name': t['name'],
        'theme_store_id': t.get('theme_store_id', 0),
        'version': t.get('version', ''),
        'price': t.get('price', ''),
        'theme_url': t.get('theme_url', ''),
        'developer': {
            'name': t.get('developer', {}).get('name', ''),
            'url': t.get('developer', {}).get('url', '')
        }
    })

with open('assets/data/themes.json', 'w') as f:
    json.dump(pruned, f, indent=2)
    f.write('\n')

print(f'Pruned {len(pruned)} themes to ThemeStoreEntry fields only')
"
```

## Important

If `ThemeStoreEntry` type changes, update the script fields to match. Source of truth: `entrypoints/popup/types.ts`.
