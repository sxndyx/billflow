#!/bin/bash
# Starts BillFlow and opens it in the browser.
#
# Run by the .app bundle and by the scheduled agent. Both are launched by
# macOS, not a shell, so PATH is nearly empty -- absolute paths come from
# .runtime.env, which install.sh generates.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG="$HOME/Library/Logs/BillFlow.log"
mkdir -p "$(dirname "$LOG")"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >>"$LOG"; }

fail() {
  log "ERROR: $1"
  /usr/bin/osascript -e "display alert \"BillFlow could not start\" message \"$1\n\nSee $LOG\" as critical" >/dev/null 2>&1
  exit 1
}

[ -f "$SCRIPT_DIR/.runtime.env" ] || fail "Missing .runtime.env. Run: npm run app:install"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/.runtime.env"

[ -x "${NODE_BIN:-}" ] || fail "node not found at ${NODE_BIN:-<unset>}. Re-run: npm run app:install"
[ -f "$PROJECT_DIR/package.json" ] || fail "Project files are missing from $PROJECT_DIR"

PORT="$(grep -E '^PORT=' "$PROJECT_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]')"
PORT="${PORT:-5001}"
URL="http://localhost:$PORT"

# --- Postgres -------------------------------------------------------------
if [ -x "${PG_ISREADY:-}" ] && ! "$PG_ISREADY" -q 2>/dev/null; then
  log "Postgres is down; starting it"
  [ -x "${BREW_BIN:-}" ] && "$BREW_BIN" services start "${PG_FORMULA:-postgresql@16}" >>"$LOG" 2>&1
  for _ in $(seq 1 30); do
    "$PG_ISREADY" -q 2>/dev/null && break
    sleep 1
  done
  "$PG_ISREADY" -q 2>/dev/null || fail "Postgres would not start. Try: brew services start ${PG_FORMULA:-postgresql@16}"
fi

# --- Server ---------------------------------------------------------------
already_up() { /usr/bin/curl -fsS -o /dev/null --max-time 2 "$URL/api/auth/config" 2>/dev/null; }

if already_up; then
  log "Server already running on $PORT"
else
  if [ ! -f "$PROJECT_DIR/dist/index.cjs" ]; then
    log "No production build; building"
    (cd "$PROJECT_DIR" && PATH="$(dirname "$NODE_BIN"):$PATH" "$NODE_BIN" "$(dirname "$NODE_BIN")/npm" run build) >>"$LOG" 2>&1 \
      || fail "Build failed. See $LOG"
  fi

  # Do not background the server here. macOS 27 reaps an app bundle's child
  # processes when the bundle's own process exits, so a nohup'd server was
  # killed a second after the browser opened. launchd owns it instead.
  log "Server not up; asking launchd to start it"
  launchctl kickstart "gui/$(id -u)/com.billflow.server" 2>>"$LOG" \
    || fail "Could not start the server agent. Run: npm run app:install"

  for _ in $(seq 1 30); do
    already_up && break
    sleep 1
  done
  already_up || fail "Server did not start. See $HOME/Library/Logs/BillFlow-server.log"
  log "Server is up"
fi

/usr/bin/open "$URL"
log "Opened $URL"
