#!/usr/bin/env zsh
set -euo pipefail
# Block until phase <NN> reports an outcome, then print its status JSON on stdout.
# Run this with the Bash tool's run_in_background:true so the orchestrator is woken on completion.
#
# Usage: wait-phase.sh <NN> [timeout_secs=3600]
#   exit 0 + status JSON   when .topaz-orch/<NN>.json appears
#   exit 3 + timeout JSON   if the timeout elapses first (session stuck / blocked on a permission prompt)

PHASE="${1:?usage: wait-phase.sh <NN> [timeout_secs]}"
TIMEOUT="${2:-3600}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
F="$REPO/.topaz-orch/$PHASE.json"

elapsed=0
while [[ ! -f "$F" ]]; do
  sleep 15
  elapsed=$((elapsed + 15))
  if (( elapsed >= TIMEOUT )); then
    jq -n --arg phase "$PHASE" '{phase:$phase, committed:false, timed_out:true}'
    exit 3
  fi
done
cat "$F"
