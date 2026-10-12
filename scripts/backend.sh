#!/usr/bin/env bash
# Usage: scripts/backend.sh start|stop|restart   (runs the packaged jar; data in $VAARTA_RUN_DIR/data)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN="${VAARTA_RUN_DIR:-$ROOT/.run}"
mkdir -p "$RUN"
stop() {
  # the pid file, plus any backend still running from this checkout's jar
  local pids
  pids="$(cat "$RUN/backend.pid" 2>/dev/null) $(ps -eo pid,args | awk -v j="$ROOT/backend/target/vaarta-backend" 'index($0, j) && /java/ {print $1}')"
  for p in $pids; do kill "$p" 2>/dev/null; done
  for _ in $(seq 1 20); do
    alive=0; for p in $pids; do kill -0 "$p" 2>/dev/null && alive=1; done
    [ $alive = 0 ] && break; sleep 1
  done
  for p in $pids; do kill -9 "$p" 2>/dev/null; done
  rm -f "$RUN/backend.pid"
}
start() {
  if curl -sf localhost:8080/api/health >/dev/null; then echo "port 8080 is already in use; run: $0 stop"; return 1; fi
  (cd "$RUN" && nohup java -jar "$ROOT/backend/target/vaarta-backend-0.1.0.jar" > "$RUN/backend.log" 2>&1 & echo $! > "$RUN/backend.pid")
  for _ in $(seq 1 90); do curl -sf localhost:8080/api/health >/dev/null && { echo "backend up"; return 0; }; sleep 2; done
  echo "backend failed to start; see $RUN/backend.log"; return 1
}
case "${1:-start}" in start) start;; stop) stop;; restart) stop; start;; esac
