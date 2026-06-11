# 0454 - v0.1.3 release state handoff

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.35

## Context

Phase 4.34 / ADR [0453](./0453-pre-v0-2-0-transition-checkpoint.md)
produced the pre-v0.2 checkpoint. The current release gates can be green for
the runtime TS prelude checkpoint, but final tag state remains human-owned and
can be stale. In particular, an existing final `v0.1.3` tag may not peel to the
intended release `HEAD`, and a green local build must not make that tag or its
draft GitHub Release trustworthy.

## Decision

Add a non-mutating release-state handoff and a normal smoke static contract.
The handoff is procedural: run the local gates, compare `HEAD` with
`v0.1.3^{commit}`, stop on a stale final tag, and make the allowed next actions
explicitly human-owned. Rejected alternatives: mutating tags, automatically
renaming the release to a new patch/RC vehicle, editing GitHub Releases, or
changing runtime, CLI, release artifact, manifest, doctor, check, explain, or
permission behavior.

## Implementation

- `docs/releases/v0.1.3-release-state-handoff.md:1` records the local gate
  commands, final tag comparison, `STALE FINAL TAG` stop condition, no-push /
  no-draft-reuse / no-silent-version-switch boundary, and allowed human-owned
  next actions.
- `.agents/skills/topaz-release/SKILL.md:89` links the stale final `v0.1.3`
  branch to the handoff before any tag or draft Release state changes.
- `.agents/skills/topaz-release/SKILL.md:115` links final readiness to the
  same handoff when the final tag comparison is stale.
- `docs/releases/pre-v0.2.0-checkpoint.md:7` states that stale final tag
  handling is covered by the release-state handoff.
- `tests/smoke.sh:595` adds `release_v0_1_3_state_handoff_contract`, which
  fails if the handoff doc loses required local gate, tag comparison,
  stale-tag, or human-owned next-action fragments, or if the release skill /
  pre-v0.2 checkpoint stop linking to it.
- `MEMO.md:368` records Phase 4.35 as documentation/static-contract work.

## Consequences

- **Accepted**: release operators have a checked-in stale-final-tag handoff for
  the current `v0.1.3` runtime TS prelude checkpoint.
- **Accepted**: normal `pnpm test` protects the handoff text and linkages
  without mutating release state or invoking GitHub.
- **Rejected**: this phase does not create, delete, move, push, trust, or
  force-move tags; edit, trust, reuse, or publish GitHub Releases; silently
  switch to `v0.1.4`; change package version; or change runtime, CLI,
  manifest, doctor, check, explain, permission, artifact, or checksum behavior.
- **Regression**: `pnpm run build` and `pnpm test`.
