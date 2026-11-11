#!/bin/bash
# Invoked by launchd on the configured weekday. launchd can express "every
# Saturday" but not "every second Saturday", so the interval is checked here
# and off weeks exit without launching.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$HOME/Library/Logs/BillFlow.log"
mkdir -p "$(dirname "$LOG")"
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') [schedule] $*" >>"$LOG"; }

# shellcheck disable=SC1091
source "$SCRIPT_DIR/schedule.conf"
INTERVAL_WEEKS="${INTERVAL_WEEKS:-2}"

TODAY="$(/bin/date '+%Y-%m-%d')"

# Both timestamps are taken at noon and the difference is rounded to whole
# days. Parsing a bare date makes date(1) fill in the current time, and when a
# daylight-saving change falls between the two dates the gap comes out an hour
# short -- 14 days reads as 13.96 and truncates to 13, which silently skips a
# scheduled run. Noon keeps every difference well clear of that boundary.
epoch_at_noon() { /bin/date -j -f "%Y-%m-%d %H:%M:%S" "$1 12:00:00" "+%s" 2>/dev/null; }

anchor_epoch="$(epoch_at_noon "$ANCHOR_DATE")" || true
[ -n "${anchor_epoch:-}" ] || { log "ANCHOR_DATE='$ANCHOR_DATE' is not a valid YYYY-MM-DD date"; exit 1; }
today_epoch="$(epoch_at_noon "$TODAY")"

diff=$(( today_epoch - anchor_epoch ))
if (( diff >= 0 )); then
  delta_days=$(( (diff + 43200) / 86400 ))
else
  delta_days=$(( (diff - 43200) / 86400 ))
fi

# Weekday is compared directly rather than inferred from the day count.
anchor_dow="$(/bin/date -j -f "%Y-%m-%d" "$ANCHOR_DATE" "+%w")"
today_dow="$(/bin/date "+%w")"
if [ "$anchor_dow" != "$today_dow" ]; then
  log "today is $(/bin/date '+%A'), schedule is anchored to a different weekday - skipping"
  exit 0
fi

weeks=$(( delta_days / 7 ))
mod=$(( weeks % INTERVAL_WEEKS ))
(( mod < 0 )) && mod=$(( mod + INTERVAL_WEEKS ))

if (( mod != 0 )); then
  log "off week (${weeks} weeks from $ANCHOR_DATE, interval ${INTERVAL_WEEKS}) - skipping"
  exit 0
fi

log "on week (${weeks} weeks from $ANCHOR_DATE) - launching"
exec "$SCRIPT_DIR/launch.sh"
