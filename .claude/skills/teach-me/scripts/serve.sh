#!/usr/bin/env bash
# serve.sh <root>
#
# Start (or reuse) a background static HTTP server for <root> (§6 of SKILL.md).
# Prints ONLY the port number on stdout so the caller can build the URL.
#
# Reuse rule: if <root>/.server.pid is a live PID and its recorded port answers,
# reuse it. Otherwise pick the first free port from 8765 up and start a server.
set -euo pipefail

ROOT="${1:?usage: serve.sh <root>}"
PID_FILE="$ROOT/.server.pid"
PORT_FILE="$ROOT/.server.port"

port_responds() {
  curl -s -o /dev/null --max-time 1 "http://localhost:$1/" 2>/dev/null
}

# 1. Reuse a healthy existing server.
if [ -f "$PID_FILE" ] && [ -f "$PORT_FILE" ]; then
  pid="$(cat "$PID_FILE")"
  port="$(cat "$PORT_FILE")"
  if kill -0 "$pid" 2>/dev/null && port_responds "$port"; then
    echo "$port"
    exit 0
  fi
fi

# 2. Find the first free port at/above 8765. A port is "free" only if nothing
#    answers a connect on either IPv4 or IPv6 AND we can bind it ourselves.
port="$(python3 - 8765 <<'PY'
import socket, sys
port = int(sys.argv[1])

def occupied(p):
    for fam, addr in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
        try:
            s = socket.socket(fam, socket.SOCK_STREAM)
            s.settimeout(0.2)
            if s.connect_ex((addr, p)) == 0:
                s.close()
                return True
            s.close()
        except OSError:
            pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(("0.0.0.0", p))
        s.close()
    except OSError:
        return True
    return False

while occupied(port):
    port += 1
print(port)
PY
)"

# 3. Start the first available server backgrounded, serving <root>.
if command -v python3 >/dev/null 2>&1; then
  # http.server sends no Cache-Control, so browsers keep stale app.js/JSON
  # after an asset sync. Serve the same files with "no-store".
  nohup python3 - "$port" "$ROOT" >/dev/null 2>&1 <<'PY' &
import functools, http.server, sys

class NoStore(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

port, root = int(sys.argv[1]), sys.argv[2]
http.server.ThreadingHTTPServer(("", port), functools.partial(NoStore, directory=root)).serve_forever()
PY
elif command -v npx >/dev/null 2>&1; then
  nohup npx --yes serve -l "$port" "$ROOT" >/dev/null 2>&1 &
elif command -v php >/dev/null 2>&1; then
  nohup php -S "localhost:$port" -t "$ROOT" >/dev/null 2>&1 &
else
  echo "no static server available (need python3, npx, or php)" >&2
  exit 1
fi
srv_pid=$!

# 4. Record pid/port and wait for the server to answer.
echo "$srv_pid" > "$PID_FILE"
echo "$port" > "$PORT_FILE"

for _ in $(seq 1 30); do
  port_responds "$port" && break
  sleep 0.1
done

echo "$port"
