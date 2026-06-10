# 0372 — Runtime Substrate Inventory Check

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.45

## Context

Runtime prelude migration has moved pure helpers out of `runtime/runtime.h`
through phase 3.44, most recently `path.resolve(...)` in
[0371](./0371-runtime-prelude-path-resolve.md). The remaining C surface is
intentionally substrate: host syscalls/libc, raw allocation, bigint/container
internals, exception jumps, and string allocation primitives. Without a
classified inventory, future helper additions can silently grow the embedded
runtime header and obscure whether something should move to TS.

## Decision

Add `scripts/check-runtime-substrate.mjs` as a policy check over discovered
`topaz_*` static helpers and runtime macro definitions (`TOPAZ_*` and
`topaz_opt_*`). Gate normal smoke and release builds on the check. Treat new
unclassified runtime helpers as a failing change that must either be categorized
as substrate or moved to the runtime prelude.

Rejected alternatives: migrating another runtime helper in this phase was
rejected because the remaining helpers require explicit intrinsics or future
capability work; a full C parser was rejected because the repo-owned header has
stable line-oriented declarations; exposing runtime prelude helpers publicly was
rejected because the prelude remains compiler-owned.

## Implementation

- `scripts/check-runtime-substrate.mjs` reads `runtime/runtime.h` by default,
  extracts anchored `topaz_*` static helper declarations plus substrate macros,
  ignores macro-body generated `##` names, and compares the result with an
  in-script inventory.
- `package.json` adds `check:runtime-substrate`.
- `tests/smoke.sh` runs the positive inventory check and a negative temp-header
  probe that appends `topaz_unclassified_probe`.
- `scripts/build-release.sh` runs the inventory check next to the runtime
  header/prelude freshness checks.
- `docs/runtime-ts-migration.md` records the inventory gate as part of the C
  substrate boundary.

## Consequences

- **accept**: current generated programs and runtime semantics are unchanged.
- **reject**: newly discovered `topaz_*` static helpers or substrate macros
  fail until classified or moved to the runtime prelude; stale inventory entries
  also fail unless explicitly exempted.
- **regression**: `runtime_substrate_inventory` covers both positive and
  negative probes in `tests/smoke.sh`.
- **scope outside**: the check does not prove C correctness, parse arbitrary C,
  migrate any runtime behavior, or change user-visible stdlib imports.
