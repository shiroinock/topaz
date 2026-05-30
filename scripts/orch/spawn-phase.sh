#!/usr/bin/env zsh
set -euo pipefail
# Spawn a FRESH interactive claude in a new Ghostty window to land ONE topaz-phase substep.
# A new window == a new session == cleared context (the manual `/clear` the user used to type).
#
# Usage: spawn-phase.sh <NN>      NN = zero-padded ordinal for this orchestration run (01, 02, ...)
#
# The orchestrator pins the design BEFORE spawning. If .topaz-orch/<NN>.brief.md exists, this
# script feeds a brief-aware prompt so the fresh session skips topaz-phase §1/§2 (goal + design,
# already decided) and goes straight to implementation. Otherwise it falls back to a bare
# /topaz-phase. TOPAZ_ORCH_PROMPT overrides both.
#
# Knobs (env):
#   TOPAZ_ORCH_PROMPT  initial prompt fed to claude          (default: brief-aware, else /topaz-phase)
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

PERM="${TOPAZ_ORCH_PERM:---permission-mode auto}"

# Prompt: explicit override wins; else brief-aware if the orchestrator pinned a design; else bare.
BRIEF="$ORCH_DIR/$PHASE.brief.md"
if [[ -n "${TOPAZ_ORCH_PROMPT:-}" ]]; then
  PROMPT="$TOPAZ_ORCH_PROMPT"
elif [[ -f "$BRIEF" ]]; then
  PROMPT="/topaz-phase

設計は .topaz-orch/$PHASE.brief.md に確定済み。まず brief を読み、§1 目標同定 / §2 設計判断はその確定内容に従って再検討しない。§3 実装 → §4 回帰 → §5 pass 確認 → §6 ADR(brief の Context / Decision を転記)→ §7 commit を回せ。brief と実装が食い違う、または brief が実装不能と判明したら commit せず理由を述べて停止する。"
else
  PROMPT="/topaz-phase"
fi

mkdir -p "$ORCH_DIR"
rm -f "$ORCH_DIR/$PHASE.json" "$ORCH_DIR/$PHASE.json.tmp"
git -C "$REPO" rev-parse HEAD > "$ORCH_DIR/$PHASE.before"

# New Ghostty window. TOPAZ_ORCH_PHASE tags the session so its Stop hook writes <NN>.json.
"$GHOSTTY" -e zsh -lc \
  "cd ${(q)REPO} && TOPAZ_ORCH_PHASE=${(q)PHASE} claude ${PERM} ${(q)PROMPT}" \
  >/dev/null 2>&1 &

echo "spawned phase $PHASE  (before HEAD=$(cat "$ORCH_DIR/$PHASE.before"))"
