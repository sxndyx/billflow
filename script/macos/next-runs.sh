#!/bin/bash
# Prints the next few dates the scheduled agent will actually launch the app.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/schedule.conf"
INTERVAL_WEEKS="${INTERVAL_WEEKS:-2}"
LAUNCH_TIME="${LAUNCH_TIME:-14:30}"

# date -v steps by calendar days, so this stays correct across daylight saving.
# The -v flag must precede -f; placed after the value, date(1) silently
# ignores both the adjustment and the output format.
step_days=$(( INTERVAL_WEEKS * 7 ))
today="$(/bin/date '+%Y-%m-%d')"
cursor="$ANCHOR_DATE"

while [[ "$cursor" < "$today" ]]; do
  cursor="$(/bin/date -j -v+${step_days}d -f "%Y-%m-%d" "$cursor" "+%Y-%m-%d")"
done

for _ in 1 2 3 4; do
  printf '  %s at %s\n' "$(/bin/date -j -f "%Y-%m-%d" "$cursor" '+%a %d %b %Y')" "$LAUNCH_TIME"
  cursor="$(/bin/date -j -v+${step_days}d -f "%Y-%m-%d" "$cursor" "+%Y-%m-%d")"
done
