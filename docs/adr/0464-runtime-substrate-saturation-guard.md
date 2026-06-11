# 0464 - runtime substrate saturation guard

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.45

## Context

Phase 4.39-4.42 moved string, boolean, and number equality or boolean hash
algorithms behind C ABI bridge tokens while pinning the residual
number/string/pointer hash helpers as C substrate. ADR
[0462](./0462-post-4-42-release-readiness-sync.md) and ADR
[0463](./0463-release-build-runtime-substrate-detail-gate.md) then made the
release gates consume detailed substrate evidence. The remaining
`runtime/runtime.h` surface is now a classified pre-v0.2 substrate boundary,
not an unclassified helper backlog.

## Decision

Make normal smoke guard the post-4.42 saturation shape from
`pnpm run check:runtime-substrate -- --details`: 56 classified symbols, the
eight active migration lane counts, the closed legacy string-buffer and
bigint-limb lanes, and detail evidence for the container/hash split. This
prevents the runtime TS migration track from silently reopening stale lanes or
drifting counts without the migration, backend, or intrinsic decision that
caused the movement.

Rejected alternatives: removing more helpers from `runtime/runtime.h` would
cross into runtime migration work; converting residual hash helpers now would
need unsigned overflow, `size_t`, canonical NaN, `-0`, and pointer identity
decisions that Topaz source cannot currently model; changing lane counts
opportunistically would hide the decision that moved the boundary; adding a
public CLI or release behavior would exceed this static-contract phase.

## Implementation

- `tests/smoke.sh:957` adds `runtime_substrate_saturation_guard`, reusing the
  detailed substrate report to assert the classified-symbol count, lane
  counts, closed legacy lanes, `topaz_hash_string` residual C substrate detail,
  and `topaz_key_eq_number` runtime-prelude bridge detail.
- `docs/runtime-ts-migration.md:242` records Phase 4.45 as the saturation guard
  for the post-4.42 substrate boundary.
- `MEMO.md:378` records the checked Phase 4.45 roadmap line.

## Consequences

- **Accepted**: remaining C substrate stays explicit and count drift fails in
  ordinary smoke before it reaches release-specific workflows.
- **Accepted**: future count movement requires its own runtime migration,
  backend, intrinsic, or substrate ADR.
- **Rejected**: runtime behavior, `runtime/runtime.h`, `runtime/prelude.ts`,
  generated runtime files, codegen, CLI behavior, package version, tags, and
  GitHub Release state are unchanged.
- **Regression**: `pnpm run check:runtime-prelude`,
  `pnpm run check:runtime-header`,
  `pnpm run check:runtime-substrate -- --details`, `pnpm run build`, and
  `pnpm test`.
