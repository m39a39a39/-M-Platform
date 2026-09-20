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
files=(package.json package-lock.json index.html src/styles.css src/app.js src/admin-mobile.js src/guest.js src/session-core.js src/session.js src/language.js src/views.js src/image-upload.js src/image-viewer.js src/bulk-excel.js)

# Download one repository archive instead of many raw.githubusercontent.com files.
archive="$stage/repo.tar.gz"
source_root="$stage/repo"
mkdir -p "$source_root"
curl --fail --location --retry 5 --retry-all-errors --retry-delay 3 \
  --connect-timeout 20 --max-time 300 \
  "https://codeload.github.com/m39a39a39/-M-Platform/tar.gz/$revision" \
  --output "$archive"
tar -xzf "$archive" -C "$source_root" --strip-components=1
source_app="$source_root/mobile-app"
for file in "${files[@]}"; do
  [[ -s "$source_app/$file" ]] || { echo "Missing $file in revision $revision" >&2; exit 1; }
done

# Build the complete version in staging before changing the installed files.
( cd "$source_app" && npm ci && npm run build )
# Preserve the existing native project and signing settings.
backup="web-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup/src"
for file in "${files[@]}"; do
  if [[ -f "$file" ]]; then cp "$file" "$backup/$file"; fi
done
for file in "${files[@]}"; do cp "$source_app/$file" "$file"; done
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
