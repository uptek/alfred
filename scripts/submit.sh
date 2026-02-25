#!/usr/bin/env bash
set -euo pipefail

# Load env vars for publish-extension
set -a
source "$(dirname "$0")/../.env.submit"
set +a

# Build the zip
bun run zip

# Find the chrome zip
zip_file=$(find .output -maxdepth 1 -name '*-chrome.zip' | head -1)

if [[ -z "$zip_file" ]]; then
  echo "Error: No chrome zip found in .output/"
  exit 1
fi

echo "Publishing $zip_file..."
publish-extension --chrome-zip "$zip_file"
