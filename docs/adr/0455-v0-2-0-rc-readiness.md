# 0455 - v0.2.0 RC readiness

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.36

## Context

Phase 4.34 / ADR [0453](./0453-pre-v0-2-0-transition-checkpoint.md) and
Phase 4.35 / ADR [0454](./0454-v0-1-3-release-state-handoff.md) separated the
runtime checkpoint / stale tag state from the `v0.2.0` guidance track. The
current `doctor`, `manifest init`, `check`, and `explain` guidance surface is
present, but release operators need a repo-local RC readiness checklist before
any tag or GitHub Release mutation.

## Decision

Add a non-mutating `v0.2.0` RC readiness checklist and a normal smoke static
contract. The checklist starts with local gates, checks `v0.2.0-rc.1` against
`HEAD` without creating or moving tags, and records the downloaded-artifact
guidance CLI validation shape. Rejected alternatives: creating, deleting,
moving, or pushing tags; editing, trusting, reusing, or publishing GitHub
Releases; silently resolving the stale final `v0.1.3` decision; renaming this
track to another release vehicle; or changing CLI, manifest, permission,
runtime, release workflow, artifact, checksum, package version, prelude, or
generated header behavior.

## Implementation

- `docs/releases/v0.2.0-rc-readiness.md:1` records the local build/test/release
  gates, non-mutating `v0.2.0-rc.1` tag comparison, no-push/no-publish
  boundary, downloaded artifact checksum / executable / guidance CLI smoke,
  expected observations, and future-out-of-scope boundary.
- `docs/releases/pre-v0.2.0-checkpoint.md:25` includes the new checklist in
  repo-local readiness evidence and links it from the `v0.2.0` starting
  surface.
- `.agents/skills/topaz-release/SKILL.md:53` links the `v0.2.0` RC path to the
  new non-mutating readiness checklist before RC tag or draft Release work.
- `tests/smoke.sh:687` adds `release_v0_2_0_rc_readiness_contract`, which
  checks required checklist fragments and the release-skill / checkpoint links
  without network access, GitHub auth, tag mutation, or `build:release`.
- `MEMO.md:369` records Phase 4.36 as documentation/static-contract work.

## Consequences

- **Accepted**: release operators get a checked-in `v0.2.0` RC checklist for
  the current guidance CLI handoff.
- **Accepted**: normal `pnpm test` protects the checklist and linkages without
  mutating release state or invoking GitHub.
- **Rejected**: this phase does not create, delete, move, push, or trust tags;
  edit, trust, reuse, or publish GitHub Releases; resolve the stale final
  `v0.1.3` decision; change package version; or change CLI, manifest,
  permission, runtime, prelude, generated header, artifact, checksum, or
  release workflow behavior.
- **Regression**: `pnpm run build` and `pnpm test`.
