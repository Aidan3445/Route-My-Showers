#!/bin/sh
# Packages extension/ into dist/route-my-showers-<version>.zip for the Chrome Web Store.
set -e
cd "$(dirname "$0")/.."
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' extension/manifest.json)
mkdir -p dist
OUT="dist/route-my-showers-$VERSION.zip"
rm -f "$OUT"
(cd extension && zip -rq "../$OUT" . -x '.*' -x '*/.*' -x 'icons/icon.svg')
echo "$OUT"
