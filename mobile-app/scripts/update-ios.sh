#!/usr/bin/env bash
set -euo pipefail

# Update the complete web app from ONE tested commit; preserve native Xcode settings.
revision=${1:?Usage: bash update-ios.sh COMMIT_SHA [mobile-app directory]}
project=${2:-/Users/mohammedal-gilany/Downloads/-M-Platform-main/mobile-app}
if [[ ! "$revision" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'A full tested GitHub commit SHA is required.' >&2
  exit 1
fi
cd "$project"
if [[ ! -f package.json || ! -d ios ]]; then
  echo 'This is not the existing mobile-app directory with its iOS project.' >&2
  exit 1
fi
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
files=(index.html src/styles.css src/app.js src/admin-mobile.js src/guest.js)
mkdir -p "$stage/src"
for file in "${files[@]}"; do
  curl --fail --location --retry 2 --connect-timeout 20 --max-time 120 \
    "https://raw.githubusercontent.com/m39a39a39/-M-Platform/$revision/mobile-app/$file" \
    --output "$stage/$file"
  [[ -s "$stage/$file" ]] || exit 1
done
# Complete download before changing the installed files.
backup="web-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup/src"
for file in "${files[@]}"; do
  if [[ -f "$file" ]]; then cp "$file" "$backup/$file"; fi
done
for file in "${files[@]}"; do cp "$stage/$file" "$file"; done
if ! npm run build; then
  for file in "${files[@]}"; do
    if [[ -f "$backup/$file" ]]; then cp "$backup/$file" "$file"; fi
  done
  echo "Build failed. Previous web source restored from $backup. iOS was not synced." >&2
  exit 1
fi
npx cap sync ios
echo "Updated from $revision. Web backup: $backup"
echo 'Open your existing Xcode workspace and run on your iPhone.'
