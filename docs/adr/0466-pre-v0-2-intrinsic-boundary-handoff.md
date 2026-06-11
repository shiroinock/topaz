# 0466 - pre-v0.2 intrinsic boundary handoff

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.47

## Context

ADR [0464](./0464-runtime-substrate-saturation-guard.md) guards the
56-symbol `runtime/runtime.h` substrate boundary, and ADR
[0465](./0465-runtime-prelude-intrinsic-boundary-guard.md) separately guards
the compiler-owned `runtime/prelude.ts` intrinsic access boundary. The pre-v0.2
handoff and v0.2 release-readiness docs already named the post-4.42 substrate
boundary, but they did not yet carry the Phase 4.46
`runtime_prelude_intrinsic_boundary_guard` evidence forward for release
operators.

## Decision

Synchronize the pre-v0.2 / v0.2 release handoff surfaces with the Phase 4.46
intrinsic-boundary guard. Operators should see two independent runtime
boundaries before RC or final publication work: detailed runtime-substrate
saturation for `runtime/runtime.h`, and smoke-level proof that `StringBuffer`,
`BigIntBuffer`, and representative `__topaz_*` intrinsics remain
compiler-owned `runtime/prelude.ts` affordances rather than public Topaz source.

Rejected alternatives: moving more C helpers to the prelude would be runtime
migration work; exposing pseudo types or intrinsics to user source would expand
the language surface; changing substrate checker counts or lanes would hide a
boundary decision; creating, moving, pushing, or trusting release tags would
cross the non-mutating handoff scope.

## Implementation

- `docs/releases/pre-v0.2.0-checkpoint.md:22` now lists runtime prelude
  intrinsic boundary smoke evidence and explains the Phase 4.46 handoff beside
  the existing substrate boundary.
- `docs/releases/v0.2.0-rc-readiness.md:21` tells RC operators that
  `pnpm test` includes `runtime_prelude_intrinsic_boundary_guard`, distinct
  from `check:runtime-substrate -- --details`.
- `docs/releases/v0.2.0.md:1` and
  `.agents/skills/topaz-release/SKILL.md:48` carry the handoff into the v0.2
  release notes and release workflow guidance.
- `tests/smoke.sh:656` extends the existing release/handoff static contracts
  with the new fragments.
- `docs/runtime-ts-migration.md:262` and `MEMO.md:380` record Phase 4.47 as
  release-handoff sync, not runtime migration.

## Consequences

- **Accepted**: v0.2 readiness now audits both the `runtime/runtime.h`
  substrate saturation boundary and the `runtime/prelude.ts` intrinsic access
  boundary.
- **Accepted**: normal `pnpm test` keeps the handoff wording from drifting.
- **Rejected**: runtime behavior, `runtime/runtime.h`, `runtime/prelude.ts`,
  generated runtime files, codegen behavior, release artifacts, package
  version, tags, and GitHub Release state are unchanged.
- **Regression**: `pnpm run check:runtime-prelude`,
  `pnpm run check:runtime-header`,
  `pnpm run check:runtime-substrate -- --details`, `pnpm run build`, and
  `pnpm test`.
