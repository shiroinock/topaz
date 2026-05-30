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
exit 0
