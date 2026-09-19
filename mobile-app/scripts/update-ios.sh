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
files=(package.json package-lock.json index.html src/styles.css src/app.js src/admin-mobile.js src/guest.js src/session-core.js src/session.js src/language.js src/views.js src/image-upload.js src/image-viewer.js)
mkdir -p "$stage/src"
for file in "${files[@]}"; do
  curl --fail --location --retry 2 --connect-timeout 20 --max-time 120 \
    "https://raw.githubusercontent.com/m39a39a39/-M-Platform/$revision/mobile-app/$file" \
    --output "$stage/$file"
  [[ -s "$stage/$file" ]] || exit 1
done
# Build the complete version in staging before changing the installed files.
( cd "$stage" && npm ci && npm run build )
# Preserve the existing native project and signing settings.
backup="web-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup/src"
for file in "${files[@]}"; do
  if [[ -f "$file" ]]; then cp "$file" "$backup/$file"; fi
done
for file in "${files[@]}"; do cp "$stage/$file" "$file"; done
if ! npm ci || ! npm run build; then
  for file in "${files[@]}"; do
    if [[ -f "$backup/$file" ]]; then cp "$backup/$file" "$file"; else rm -f "$file"; fi
  done
  echo "Build failed. Previous web source restored from $backup. iOS was not synced." >&2
  exit 1
fi
# Raise only obsolete deployment targets; keep bundle ID, signing and team settings.
native_project=ios/App/App.xcodeproj/project.pbxproj
cp "$native_project" "$backup/project.pbxproj"
node --input-type=module <<'NODE'
import {readFileSync,writeFileSync} from 'node:fs';
const path='ios/App/App.xcodeproj/project.pbxproj';
const source=readFileSync(path,'utf8');
writeFileSync(path,source.replace(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g,
  (setting,version)=>Number(version)<15?'IPHONEOS_DEPLOYMENT_TARGET = 15.0;':setting));
NODE
npx cap sync ios
echo "Updated from $revision. Web backup: $backup"
echo 'Open your existing Xcode workspace and run on your iPhone.'
