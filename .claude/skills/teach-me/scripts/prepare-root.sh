#!/usr/bin/env bash
# prepare-root.sh <root> [slug]
#
# Idempotent root setup for a teach-me library root (§3 of SKILL.md):
#   - creates <root>/lectures[/<slug>]
#   - version-syncs site assets from $SKILL/site/ when the skill is newer
#   - writes .gitignore for project-local roots (anything not under ~/.claude);
#     in this repo it ignores only .server.pid/.server.port
#
# Prints one status line: "synced <skillVer>" or "up-to-date <rootVer>".
set -euo pipefail

ROOT="${1:?usage: prepare-root.sh <root> [slug]}"
SLUG="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
SITE="$SKILL_DIR/site"

mkdir -p "$ROOT/lectures"
[ -n "$SLUG" ] && mkdir -p "$ROOT/lectures/$SLUG"

skill_ver="$(cat "$SITE/VERSION" 2>/dev/null || echo 0)"
root_ver="$(cat "$ROOT/VERSION" 2>/dev/null || echo 0)"

if [ ! -f "$ROOT/index.html" ] || [ "$skill_ver" -gt "$root_ver" ]; then
  # Copy every asset except VERSION, then VERSION last so a crash mid-copy
  # never marks the root as up-to-date with a partial asset set.
  for f in "$SITE"/*; do
    base="$(basename "$f")"
    [ "$base" = "VERSION" ] && continue
    cp "$f" "$ROOT/$base"
  done
  cp "$SITE/VERSION" "$ROOT/VERSION"
  synced="synced $skill_ver"
else
  synced="up-to-date $root_ver"
fi

# Project-local roots (not inside the global ~/.claude library) get a .gitignore.
# This vendored copy (claude-CCAR-F-practice) keeps the repo self-contained: the
# synced site assets, library.json and every lecture are committed; only the
# server runtime files are ignored.
case "$ROOT" in
  "$HOME/.claude/"*) : ;;
  *)
    cat > "$ROOT/.gitignore" <<'EOF'
# teach-me: only the local server's runtime files are ignored. Site assets,
# library.json and lectures/*/{lecture.md,questions.json} are committed.
.server.pid
.server.port
EOF
    ;;
esac

echo "$synced"
