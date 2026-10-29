#!/usr/bin/env bash
# build-site.sh
#
# Copy the teach-me portal into dist/ccar-f-course/ as plain files for
# Cloudflare. The Worker is routed at teach-me.leprz.com/ccar-f-course*, and
# asset paths match the full URL path, so the site sits under that prefix.
# teach-me/fixtures is a local symlink, so the repo's fixtures/ is copied in
# directly instead.
set -euo pipefail

PREFIX=ccar-f-course

cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p "dist/$PREFIX"
rsync -a --exclude '.server.*' --exclude '.gitignore' --exclude '/fixtures' teach-me/ "dist/$PREFIX/"
cp -R fixtures "dist/$PREFIX/fixtures"
cp deploy/_headers dist/_headers
echo "built dist/$PREFIX ($(find dist -type f | wc -l | tr -d ' ') files)"
