# 0453 - pre-v0.2.0 transition checkpoint

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.34

## Context

The runtime TS prelude migration and `v0.1.3` release-readiness docs now exist,
while local release tags remain human-owned state. ADR
[0451](./0451-v0-1-3-release-notes.md) and ADR
[0452](./0452-v0-1-3-final-readiness.md) made the `v0.1.3` notes and final
readiness checklist checked-in artifacts. The repo now needs a clean handoff
from "runtime migration checkpoint" to "v0.2 capability guidance release track"
that does not accidentally imply more runtime C-to-TS migration or perform
release mutation.

## Decision

Add a checked-in pre-v0.2.0 checkpoint, link it from the runtime migration doc
and release skill, and guard its evidence and boundary text with `pnpm test`.
Rejected alternatives: publishing or re-tagging `v0.1.3` would mutate
human-owned release state; starting `v0.2.0` behavior changes now would broaden
the phase beyond a transition checkpoint; reopening closed runtime migration
lanes would conflict with the pinned substrate checker boundary; changing CLI,
manifest, doctor, check, or explain behavior would turn evidence into new
product behavior; generating v0.2 release notes or artifacts should wait for an
explicit release-candidate phase.

## Implementation

- `docs/releases/pre-v0.2.0-checkpoint.md:1` records the transition checkpoint,
  the `v0.1.3` human-owned release-state caveat, repo-local readiness evidence,
  pinned runtime substrate/intrinsic lane counts, current v0.2 guidance command
  surface, and future-out-of-scope boundary.
- `docs/runtime-ts-migration.md:261` links to the checkpoint and repeats only
  the pinned substrate/intrinsic runtime boundary rather than the full release
  checklist.
- `.agents/skills/topaz-release/SKILL.md:47` tells future release operators to
  consult the checkpoint before switching from the `v0.1.3` runtime checkpoint
  to a `v0.2.0` release candidate, while preserving manual publication policy.
- `tests/smoke.sh:604` adds `pre_v0_2_0_checkpoint_contract`, which fails if
  the checkpoint loses readiness evidence, lane counts, v0.2 guidance commands,
  future-out-of-scope text, runtime migration doc linkage, or release skill
  linkage.
- `MEMO.md:367` records Phase 4.34 as documentation/static-contract work.

## Consequences

- **Accepted**: the repo has a checked-in handoff from the `v0.1.3` runtime TS
  prelude checkpoint to the `v0.2.0` capability guidance track.
- **Accepted**: normal `pnpm test` now protects the checkpoint evidence list,
  pinned runtime boundary counts, guidance command list, future-work boundary,
  and docs/skill linkages.
- **Rejected**: this phase does not create, delete, move, push, trust, or
  force-move tags; edit or publish GitHub Releases; generate release artifacts
  or notes for v0.2.0; change package version; or change runtime, CLI,
  manifest, doctor, check, explain, permission, or release artifact behavior.
- **Regression**: `pnpm run build` and `pnpm test`.
