#!/usr/bin/env zsh
set -euo pipefail
# Stop hook. Fires when a claude session in this repo finishes a turn and yields control.
#
# For an orchestrator-spawned impl session (TOPAZ_ORCH_PHASE set) this records the outcome
# to .topaz-orch/<NN>.json so the orchestrator can detect completion without reading the pane.
# For EVERY other session (the orchestrator itself, ad-hoc work) it is a no-op.
#
# Outcome semantics — in an unattended interactive session claude only Stops to either:
#   committed=true   it landed the substep and finished        -> orchestrator continues
#   committed=false  it halted to ask the user something        -> orchestrator stops + surfaces last_msg
#
# Once the outcome is recorded, this hook AUTO-CLOSES the spawned Ghostty window (both outcomes):
# the interactive claude has nothing left to do, so we terminate it and the window closes. A halted
# session's question is surfaced to the user via last_msg in <NN>.json, not by leaving the window up.
# (A session STUCK on a permission prompt never Stops, so this hook never fires for it and its window
#  stays open — that is correct, the user has to answer the prompt there.)

[[ -n "${TOPAZ_ORCH_PHASE:-}" ]] || exit 0

PHASE="$TOPAZ_ORCH_PHASE"
REPO="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
ORCH_DIR="$REPO/.topaz-orch"
mkdir -p "$ORCH_DIR"

input="$(cat)"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // ""')"

before="$(cat "$ORCH_DIR/$PHASE.before" 2>/dev/null || echo "")"
after="$(git -C "$REPO" rev-parse HEAD 2>/dev/null || echo "")"
committed=false
[[ -n "$before" && -n "$after" && "$before" != "$after" ]] && committed=true

# Best-effort: last assistant text block from the transcript (so the orchestrator can read a
# halted session's question without opening the pane). Empty if jq/transcript unavailable.
last_msg=""
if [[ -n "$transcript" && -f "$transcript" ]]; then
  last_msg="$(jq -rs '[.[] | select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text] | last // ""' "$transcript" 2>/dev/null | tail -c 3000)"
fi

subject="$(git -C "$REPO" log -1 --pretty=%s 2>/dev/null || echo "")"

# Atomic write so the wait poller never reads a half-written file.
jq -n \
  --arg phase "$PHASE" --arg before "$before" --arg after "$after" \
  --argjson committed "$committed" --arg last_msg "$last_msg" \
  --arg subject "$subject" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{phase:$phase, committed:$committed, before:$before, after:$after, commit_subject:$subject, last_msg:$last_msg, stopped_at:$ts}' \
  > "$ORCH_DIR/$PHASE.json.tmp"
mv -f "$ORCH_DIR/$PHASE.json.tmp" "$ORCH_DIR/$PHASE.json"

# Auto-close the spawned window. The claude process for THIS phase is the topmost ancestor carrying
# TOPAZ_ORCH_PHASE=<NN> in its environment: spawn-phase.sh sets it as a prefix assignment on `claude`
# only, so claude + its descendants (this hook included) have it but the `zsh -lc` launcher above
# does not. Killing that claude ends `ghostty -e zsh -lc "...claude..."`, so the window closes.
# Detached (`&!`) + delayed so this hook returns its exit status to claude first; SIGTERM, then
# SIGKILL as a fallback in case claude traps TERM.
target=""
walk=$PPID
for _ in 1 2 3 4 5 6 7 8; do
  [[ -z "$walk" || "$walk" -le 1 ]] && break
  if ps eww -p "$walk" 2>/dev/null | grep -q "TOPAZ_ORCH_PHASE=$PHASE"; then
    target="$walk"
  fi
  walk="$(ps -o ppid= -p "$walk" 2>/dev/null | tr -d ' ')"
done
if [[ -n "$target" ]]; then
  ( sleep 1; kill "$target" 2>/dev/null; sleep 4; kill -9 "$target" 2>/dev/null ) &!
fi

exit 0
