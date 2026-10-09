#!/usr/bin/env bash
# Smoke test for the Labrynth Electron desktop shell.
#
# Launches the Electron app with an isolated HOME and userData directory, waits
# for the REACHER backend the shell spawns to answer /health, asks the shell to
# quit with SIGTERM (the same path as logout or kill), then checks that the
# Electron process, the backend and the port are all gone.
#
# Usage: scripts/desktop-smoke.sh <path-to-electron-executable> [port]
#   port defaults to 6329. Never 6229, so the test cannot collide with a real
#   install of the app.
#
# Notes:
#   --no-sandbox  The setuid chrome-sandbox cannot be installed on a CI runner
#                 or inside an AppImage, and Chromium's sandbox aborts startup
#                 there. Only this script passes the flag.
#   No --ozone-platform=headless: it segfaults on these hosts. CI supplies a
#                 display with `xvfb-run -a`; locally, run on the desktop session.
#
# Exit codes: 0 PASS, 1 FAIL, 2 usage error or port already in use.
set -euo pipefail

usage() {
  echo "usage: $0 <path-to-electron-executable> [port]" >&2
  exit 2
}

[[ $# -ge 1 && $# -le 2 ]] || usage
PORT=${2:-6329}
if [[ ! $PORT =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then usage; fi
EXE=$(readlink -f -- "$1") || usage
if [[ ! -f $EXE || ! -x $EXE ]]; then
  echo "DESKTOP SMOKE FAIL: not an executable file: $1" >&2
  exit 2
fi

TMP=""
EPID=""
BPID=""
ELECTRON_RC=0

# True when the pid exists and is not a zombie (exited but not yet reaped).
proc_alive() {
  local st
  st=$(sed -e 's/^.*) //' "/proc/$1/stat" 2>/dev/null | cut -d' ' -f1) || return 1
  [[ -n $st && $st != Z ]]
}

# Print every descendant pid of $1, depth first.
descendants() {
  local c
  for c in $(pgrep -P "$1" 2>/dev/null || true); do
    echo "$c"
    descendants "$c"
  done
}

# SIGTERM each given pid and its descendants, then SIGKILL survivors after 10 s.
kill_tree() {
  local pid c i any
  local -a victims=()
  for pid in "$@"; do
    [[ -n $pid ]] || continue
    victims+=("$pid")
    while IFS= read -r c; do
      [[ -n $c ]] && victims+=("$c")
    done < <(descendants "$pid")
  done
  (( ${#victims[@]} )) || return 0
  for pid in "${victims[@]}"; do
    if proc_alive "$pid"; then kill -TERM "$pid" 2>/dev/null || true; fi
  done
  for ((i = 0; i < 20; i++)); do
    any=0
    for pid in "${victims[@]}"; do
      proc_alive "$pid" && any=1
    done
    (( any == 0 )) && return 0
    sleep 0.5
  done
  for pid in "${victims[@]}"; do
    if proc_alive "$pid"; then kill -KILL "$pid" 2>/dev/null || true; fi
  done
  return 0
}

port_listening() {
  [[ -n $(ss -Hltn "sport = :$PORT" 2>/dev/null) ]]
}

listener_pid() {
  ss -Hltnp "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -n 1 | cut -d= -f2 || true
}

health_ok() {
  local body
  body=$(curl -sf --max-time 2 "http://localhost:$PORT/health") || return 1
  grep -Eq '"service" *: *"reacher"' <<<"$body"
}

# The backend logs requests to its NDJSON run log under the isolated HOME.
token_requested() {
  local f
  for f in "$HOME"/REACHER/LOG/runs/*/app.ndjson; do
    if [[ -f $f ]] && grep -qF '"path":"/api/auth/token"' "$f"; then
      return 0
    fi
  done
  return 1
}

# Collect Electron's exit status. wait also reaps the zombie.
reap_electron() {
  ELECTRON_RC=0
  wait "$EPID" 2>/dev/null || ELECTRON_RC=$?
}

dump_logs() {
  local f
  for f in "$TMP/electron.log" "$LABRYNTH_USER_DATA/logs/backend.log"; do
    echo "----- last 200 lines of $f -----"
    if [[ -f $f ]]; then tail -n 200 "$f"; else echo "(missing)"; fi
  done
}

fail() {
  dump_logs
  kill_tree "$EPID" "$BPID"
  echo "DESKTOP SMOKE FAIL: $1"
  exit 1
}

cleanup() {
  local rc=$?
  kill_tree "$EPID" "$BPID" >/dev/null 2>&1 || true
  if [[ -n $TMP && -d $TMP ]]; then rm -rf -- "$TMP"; fi
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if port_listening; then
  echo "DESKTOP SMOKE FAIL: port $PORT is already in use (listener pid $(listener_pid)); refusing to run"
  exit 2
fi

TMP=$(mktemp -d)
export HOME="$TMP/home"
export LABRYNTH_USER_DATA="$TMP/userdata"
export REACHER_PORT="$PORT"
export BROWSER=true
mkdir -p "$HOME" "$LABRYNTH_USER_DATA"

echo "[smoke] executable: $EXE"
echo "[smoke] port: $PORT  HOME: $HOME  userData: $LABRYNTH_USER_DATA"
"$EXE" --no-sandbox >"$TMP/electron.log" 2>&1 &
EPID=$!
echo "[smoke] electron pid $EPID"

healthy=0
for ((i = 0; i < 60; i++)); do
  if health_ok; then healthy=1; break; fi
  if ! proc_alive "$EPID"; then break; fi
  sleep 1
done
if (( ! healthy )); then
  if proc_alive "$EPID"; then
    fail "backend did not answer /health on port $PORT within 60 s"
  fi
  reap_electron
  fail "electron exited during startup (status $ELECTRON_RC) before /health answered"
fi
echo "[smoke] /health answered with service=reacher"

BPID=$(listener_pid)
if [[ -z $BPID ]]; then
  fail "could not identify the backend pid listening on port $PORT"
fi
echo "[smoke] backend pid $BPID"
if grep -qx "$BPID" <<<"$(descendants "$EPID")"; then
  echo "[smoke] backend is a child of electron"
else
  echo "WARN: backend pid $BPID is not a child of electron pid $EPID"
fi

token_ok=0
for ((i = 0; i < 20; i++)); do
  if token_requested; then token_ok=1; break; fi
  sleep 1
done
if (( token_ok )); then
  echo "[smoke] window fetched /api/auth/token (seen in app.ndjson)"
else
  echo "WARN: no /api/auth/token request in $HOME/REACHER/LOG/runs/*/app.ndjson after 20 s; the window may not have loaded the app (log format may differ)"
fi

echo "[smoke] sending SIGTERM to electron pid $EPID"
kill -TERM "$EPID"
exited=0
for ((i = 0; i < 40; i++)); do
  if ! proc_alive "$EPID"; then exited=1; break; fi
  sleep 0.5
done
if (( ! exited )); then
  fail "electron did not exit within 20 s of SIGTERM"
fi
reap_electron
echo "[smoke] electron exited (status $ELECTRON_RC)"
if (( ELECTRON_RC != 0 )); then
  echo "WARN: electron exit status $ELECTRON_RC (expected 0 after a clean quit)"
fi

port_free=0
backend_gone=0
for ((i = 0; i < 30; i++)); do
  port_listening || port_free=1
  proc_alive "$BPID" || backend_gone=1
  if (( port_free && backend_gone )); then break; fi
  sleep 0.5
done
if (( ! port_free )); then
  fail "port $PORT is still listening 15 s after electron exited"
fi
if (( ! backend_gone )); then
  fail "backend pid $BPID is still alive 15 s after electron exited"
fi
echo "[smoke] port $PORT is free; backend pid $BPID is gone"

EPID=""
BPID=""
echo "DESKTOP SMOKE PASS"
