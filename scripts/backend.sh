#!/usr/bin/env bash
# Usage: scripts/backend.sh start|stop|restart   (runs the packaged jar; data in $VAARTA_RUN_DIR/data)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN="${VAARTA_RUN_DIR:-$ROOT/.run}"
mkdir -p "$RUN"
stop() { [ -f "$RUN/backend.pid" ] && kill "$(cat "$RUN/backend.pid")" 2>/dev/null; rm -f "$RUN/backend.pid"; sleep 1; }
start() {
  (cd "$RUN" && nohup java -jar "$ROOT/backend/target/vaarta-backend-0.1.0.jar" > "$RUN/backend.log" 2>&1 & echo $! > "$RUN/backend.pid")
  for _ in $(seq 1 90); do curl -sf localhost:8080/api/health >/dev/null && { echo "backend up"; return 0; }; sleep 2; done
  echo "backend failed to start; see $RUN/backend.log"; return 1
}
case "${1:-start}" in start) start;; stop) stop;; restart) stop; start;; esac
