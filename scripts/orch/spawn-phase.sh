#!/usr/bin/env zsh
set -euo pipefail
# Spawn a FRESH interactive claude in a new Ghostty window to land ONE topaz-phase substep.
# A new window == a new session == cleared context (the manual `/clear` the user used to type).
#
# Usage: spawn-phase.sh <NN>      NN = zero-padded ordinal for this orchestration run (01, 02, ...)
#
# Knobs (env):
#   TOPAZ_ORCH_PROMPT  initial prompt fed to claude          (default: /topaz-phase)
#   TOPAZ_ORCH_PERM    permission flags for the impl session (default: --permission-mode auto)
#                      auto = routine dev actions auto-approve, the classifier still DENIES
#                      genuinely dangerous ones (a denial makes claude adapt, it does not halt).
#                      Override to dial up/down, e.g.:
#                        TOPAZ_ORCH_PERM="--dangerously-skip-permissions"   (no guardrails)
#                        TOPAZ_ORCH_PERM="--permission-mode acceptEdits"    (edits auto, bash prompts)

PHASE="${1:?usage: spawn-phase.sh <NN>}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
ORCH_DIR="$REPO/.topaz-orch"
GHOSTTY="/Applications/Ghostty.app/Contents/MacOS/ghostty"

PROMPT="${TOPAZ_ORCH_PROMPT:-/topaz-phase}"
PERM="${TOPAZ_ORCH_PERM:---permission-mode auto}"

mkdir -p "$ORCH_DIR"
rm -f "$ORCH_DIR/$PHASE.json" "$ORCH_DIR/$PHASE.json.tmp"
git -C "$REPO" rev-parse HEAD > "$ORCH_DIR/$PHASE.before"

# New Ghostty window. TOPAZ_ORCH_PHASE tags the session so its Stop hook writes <NN>.json.
"$GHOSTTY" -e zsh -lc \
  "cd ${(q)REPO} && TOPAZ_ORCH_PHASE=${(q)PHASE} claude ${PERM} ${(q)PROMPT}" \
  >/dev/null 2>&1 &

echo "spawned phase $PHASE  (before HEAD=$(cat "$ORCH_DIR/$PHASE.before"))"
