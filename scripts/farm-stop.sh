#!/usr/bin/env bash
# scripts/farm-stop.sh — draft teardown for Resonara G30 release-qualification farm
# Reaps farm.lock, lite-server.pid, farm/desktop ports, and farm-related node workers.
# Safe to re-run; never fails the shell on missing targets.
#
# DRAFT: refine after real teardown evidence lands in reports/phase-13.md
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FARM_ROOT="${FARM_ROOT:-$ROOT/farm-output}"
FARM_PORT="${FARM_PORT:-3860}"
FARM_STATUS_PORT="${FARM_STATUS_PORT:-3861}"
DESKTOP_PORT="${DESKTOP_PORT:-3847}"

LOCK_PATH="${FARM_ROOT}/farm.lock"
LITE_PID_PATH="${FARM_ROOT}/lite-server.pid"
UI_PID_PATH="${ROOT}/.resonara-ui.pid"

log() { printf '[farm-stop] %s\n' "$*"; }

# ── helpers ────────────────────────────────────────────────────────────────

is_pid_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

kill_pid_graceful() {
  local pid="$1"
  local label="${2:-pid}"
  if ! is_pid_alive "$pid"; then
    return 0
  fi
  log "SIGTERM ${label} pid=${pid}"
  kill -TERM "$pid" 2>/dev/null || true
  sleep 0.4
  if is_pid_alive "$pid"; then
    log "SIGKILL ${label} pid=${pid}"
    kill -KILL "$pid" 2>/dev/null || true
  fi
}

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "${pids}" ]]; then
    log "port ${port}: no LISTEN"
    return 0
  fi
  for p in ${pids}; do
    kill_pid_graceful "$p" "port-${port}"
  done
}

# ── 1. Prefer orchestrator cancel when lock is live ────────────────────────

if [[ -f "${LOCK_PATH}" ]]; then
  log "found ${LOCK_PATH}"
  if command -v node >/dev/null 2>&1 && [[ -f "$ROOT/scripts/render-farm.js" ]]; then
    log "attempting: node scripts/render-farm.js cancel"
    node "$ROOT/scripts/render-farm.js" cancel 2>/dev/null || true
  fi
  # Best-effort: kill PID recorded in lock if still alive (JSON or bare pid)
  lock_pid="$(
    python3 - "${LOCK_PATH}" <<'PY' 2>/dev/null || true
import json, re, sys
p = sys.argv[1]
try:
    raw = open(p, encoding="utf-8").read().strip()
    try:
        data = json.loads(raw)
        print(int(data.get("pid") or data.get("farmPid") or 0) or "")
    except Exception:
        m = re.search(r"\d+", raw)
        print(m.group(0) if m else "")
except Exception:
    pass
PY
  )"
  if [[ -n "${lock_pid:-}" ]]; then
    kill_pid_graceful "${lock_pid}" "farm.lock"
  fi
else
  log "no farm.lock"
fi

# ── 2. lite-server.pid ─────────────────────────────────────────────────────

if [[ -f "${LITE_PID_PATH}" ]]; then
  lite_pid="$(tr -dc '0-9' <"${LITE_PID_PATH}" | head -c 12 || true)"
  if [[ -n "${lite_pid}" ]]; then
    kill_pid_graceful "${lite_pid}" "lite-server"
  fi
else
  log "no lite-server.pid"
fi

if [[ -f "${UI_PID_PATH}" ]]; then
  ui_pid="$(tr -dc '0-9' <"${UI_PID_PATH}" | head -c 12 || true)"
  if [[ -n "${ui_pid}" ]]; then
    kill_pid_graceful "${ui_pid}" "resonara-ui"
  fi
fi

# ── 3. Ports: farm app / status / desktop ──────────────────────────────────

free_port "${FARM_PORT}"
free_port "${FARM_STATUS_PORT}"
free_port "${DESKTOP_PORT}"

# ── 4. Node farm workers by command line ───────────────────────────────────
# Matches: render-farm, farm-measure, soak-memory-probe (node processes only)

reap_node_script() {
  local pattern="$1"
  local pids
  # pgrep -f is best-effort; fall back to ps|awk
  pids="$(pgrep -f "node .*${pattern}" 2>/dev/null || true)"
  if [[ -z "${pids}" ]]; then
    pids="$(ps -axo pid=,command= 2>/dev/null | awk -v pat="${pattern}" '
      $0 ~ /node/ && $0 ~ pat { print $1 }
    ' || true)"
  fi
  if [[ -z "${pids}" ]]; then
    log "no node ${pattern} processes"
    return 0
  fi
  for p in ${pids}; do
    # Do not kill self
    if [[ "$p" == "$$" ]] || [[ "$p" == "$PPID" ]]; then
      continue
    fi
    kill_pid_graceful "$p" "node-${pattern}"
  done
}

reap_node_script "render-farm"
reap_node_script "farm-measure"
reap_node_script "soak-memory-probe"

# ── 5. Remove lock / pid files ─────────────────────────────────────────────

rm -f "${LOCK_PATH}" "${LITE_PID_PATH}" "${UI_PID_PATH}" 2>/dev/null || true
log "removed lock/pid files (if present)"

# ── 6. Summary proof surface (caller may paste into phase-13) ──────────────

log "LISTEN check:"
for port in "${FARM_PORT}" "${FARM_STATUS_PORT}" "${DESKTOP_PORT}"; do
  left="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "${left}" ]]; then
    log "  :${port} clear"
  else
    log "  :${port} STILL LISTEN pids=${left}"
  fi
done

log "farm-stop complete"
exit 0
