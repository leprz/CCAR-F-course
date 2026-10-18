#!/usr/bin/env bash
# stop.sh <root> [<root> ...]
#
# Stop the background server(s) for the given root(s) (§10 of SKILL.md): kill the
# recorded PID if alive and remove the .server.pid / .server.port files.
# Pass every root you want stopped (e.g. the global root and the project-local one).
set -uo pipefail

[ "$#" -ge 1 ] || { echo "usage: stop.sh <root> [<root> ...]" >&2; exit 1; }

for ROOT in "$@"; do
  PID_FILE="$ROOT/.server.pid"
  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null && echo "stopped server (pid $pid) for $ROOT"
    else
      echo "no live server for $ROOT (stale pid file removed)"
    fi
    rm -f "$PID_FILE" "$ROOT/.server.port"
  else
    echo "no server recorded for $ROOT"
  fi
done
