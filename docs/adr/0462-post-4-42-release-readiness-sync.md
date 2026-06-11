# 0462 - post-4.42 release readiness sync

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.43

## Context

ADR [0455](./0455-v0-2-0-rc-readiness.md) and ADR
[0456](./0456-v0-2-0-release-notes.md) drafted the `v0.2.0` RC readiness and
final release-note surfaces before Phase 4.39-4.42 finished moving and pinning
the last container-helper boundary details. ADR
[0458](./0458-string-eq-container-prelude-bridge.md), ADR
[0459](./0459-boolean-container-prelude-bridge.md), ADR
[0460](./0460-number-container-equality-prelude-bridge.md), and ADR
[0461](./0461-residual-container-hash-substrate.md) now define the post-4.42
split: equality/boolean bridges delegate to runtime prelude helpers, while
number/string/pointer hashes intentionally remain C substrate.

## Decision

Synchronize the pre-v0.2 / v0.2 release-readiness docs and their static smoke
contracts with the post-4.42 runtime boundary. Release operators now see the
runtime-prelude, runtime-header, and detailed runtime-substrate gates before
build/test/release-build work, and the docs explicitly name the bridge helpers
and residual hash helpers without mutating release state.

Rejected alternatives: publishing `v0.2.0-rc.1` now would create external
release state; creating, deleting, moving, or pushing tags would cross the
non-mutating readiness boundary; introducing `v0.1.4` would silently switch
release vehicles; changing runtime, generated runtime, codegen, manifest,
doctor, check, or explain behavior belongs to a separate feature phase.

## Implementation

- `docs/releases/pre-v0.2.0-checkpoint.md:42` records the post-4.42
  bridge/residual split and points operators at
  `pnpm run check:runtime-substrate -- --details`.
- `docs/releases/v0.2.0-rc-readiness.md:13` adds
  `pnpm run check:runtime-prelude`, `pnpm run check:runtime-header`, and
  `pnpm run check:runtime-substrate -- --details` to the local gates before
  build/test/release-build.
- `docs/releases/v0.2.0.md:15` keeps the `Changes / Assets / Verification /
  Notes` structure while noting that runtime/prelude/header behavior is
  preserved from the post-4.42 boundary.
- `tests/smoke.sh:664` extends release/static contracts for the checkpoint,
  RC readiness, and release notes fragments.
- `MEMO.md:376` records the completed docs/static-contract phase.

## Consequences

- **Accepted**: release operators have checked-in post-4.42 runtime boundary
  evidence before preparing `v0.2.0-rc.1`.
- **Accepted**: normal `pnpm test` statically protects the new release-doc
  fragments and the three runtime gate commands.
- **Rejected**: runtime behavior, generated runtime, codegen, release assets,
  package version, tags, GitHub Releases, manifest, doctor, check, and explain
  behavior are unchanged.
- **Regression**: `pnpm run check:runtime-prelude`,
  `pnpm run check:runtime-header`,
  `pnpm run check:runtime-substrate -- --details`, `pnpm run build`, and
  `pnpm test`.
