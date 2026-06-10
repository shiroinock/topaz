# 0356 - runtime header freshness check

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.29

## Context

ADR [0353](./0353-embedded-runtime-header.md) embedded `runtime/runtime.h` into
the generated compiler so release artifacts can be binary-only. ADR
[0355](./0355-runtime-ts-prelude-boundary.md) kept that C header as the runtime
substrate while runtime TS prelude work begins.

`src/runtime_header.ts` is generated code. If `runtime/runtime.h` changes
without regenerating it, day-to-day smoke tests and release builds can trust a
stale embedded runtime copy.

## Decision

Treat generated runtime-header freshness as a first-class gate. The existing
`scripts/generate-runtime-header.mjs` now renders the expected TypeScript source
through a shared helper and supports `--check`, which compares that exact text
against `src/runtime_header.ts`.

Rejected alternatives: adding a second checker script was rejected because it
could drift from the writer; splitting `runtime/runtime.h` was rejected because
the runtime TS prelude substrate boundary remains unchanged; removing
`-Iruntime` was rejected because local C builds still use the header path.

## Implementation

- `scripts/generate-runtime-header.mjs:40` adds
  `renderRuntimeHeaderSource(...)`; `scripts/generate-runtime-header.mjs:70`
  adds check mode with a clear regeneration hint.
- `package.json:18` exposes `pnpm run check:runtime-header`.
- `tests/smoke.sh:7` runs the freshness check before parser/codegen smoke work
  and reports `PASS [runtime_header_fresh]`.
- `scripts/build-release.sh:36` runs the same check before the expensive
  self-host fixed-point release gate.
- `README.md` and `docs/runtime-ts-migration.md` document the regeneration and
  migration gate.

## Consequences

- **Accepted**: runtime C edits fail fast when the embedded compiler copy is
  stale.
- **Accepted**: release artifact builds cannot proceed to self-hosting with a
  stale generated runtime header.
- **Regression**: `pnpm test` now includes `PASS [runtime_header_fresh]`; no
  dirtying negative smoke is added.
- **Scope outside**: no runtime header split, runtime TS prelude loading,
  generated C semantic change, release tag change, or artifact publication.
