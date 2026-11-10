#!/bin/sh
# Packages extension/ into dist/route-my-showers-<version>.zip. The same zip goes to the Chrome Web Store and Firefox Add-ons (AMO).
set -e
cd "$(dirname "$0")/.."
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' extension/manifest.json)
mkdir -p dist
OUT="dist/route-my-showers-$VERSION.zip"
rm -f "$OUT"
(cd extension && zip -rq "../$OUT" . -x '.*' -x '*/.*' -x 'icons/icon.svg')
echo "$OUT"
