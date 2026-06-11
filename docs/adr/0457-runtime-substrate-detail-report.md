# 0457 - runtime substrate detail report

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.38

## Context

After the v0.2 release-note prep in ADR [0456](./0456-v0-2-0-release-notes.md),
runtime migration work resumes from the pinned C substrate lanes. The substrate
checker already reports category and migration-lane counts, but future worker
phases need per-symbol evidence before attempting any remaining C-to-TS move.
`topaz_string_eq` is the warning example: it looks like a pure string helper,
but still feeds scalar Map/Set macro substrate and should not move without a
container monomorphization or generated-C ordering decision.

## Decision

Add an opt-in `--details` report to `scripts/check-runtime-substrate.mjs` and
guard it in normal smoke. The default summary remains the inventory gate, while
`--details` appends symbol-name-sorted lines with kind, `runtime/runtime.h`
location, category, migration lane, reason, and next guidance. Rejected
alternatives: moving `topaz_string_eq` now would cross the container substrate
boundary; splitting `runtime/runtime.h` would change the embedded header shape;
JSON output is unnecessary for the current shell/doc workflow; changing runtime
behavior, generated C, release flow, manifest/check/doctor, or public language
surface is outside this tooling phase.

## Implementation

- `scripts/check-runtime-substrate.mjs:4` adds argument parsing for an optional
  `--details` flag before or after the existing custom runtime header path.
- `scripts/check-runtime-substrate.mjs:550` appends the deterministic
  `details:` section only when requested, sorted by symbol name and backed by
  the existing inventory metadata plus discovered line locations.
- `tests/smoke.sh:877` runs
  `pnpm run check:runtime-substrate -- --details` and checks representative C
  ABI type, raw memory, container monomorph, libc/libm, host ABI, exception,
  StringBuffer intrinsic-family, and BigInt limb intrinsic-family fragments.
- `docs/runtime-ts-migration.md:37` documents the detail report as the scout
  step before choosing any remaining substrate migration.
- `MEMO.md:371` records Phase 4.38 as a tooling/static-contract change.

## Consequences

- **Accepted**: future runtime migration phases can inspect explicit
  per-symbol category, migration lane, reason, and next guidance from the
  checker output instead of reading the checker source by hand.
- **Accepted**: existing custom-header negative probes still work, including
  `node scripts/check-runtime-substrate.mjs build/probe.h --details` and
  `node scripts/check-runtime-substrate.mjs --details build/probe.h`.
- **Rejected**: this phase does not move or delete helpers, split
  `runtime/runtime.h`, change runtime/header/prelude/generated runtime output,
  change release artifacts, or add a public CLI command.
- **Regression**: `pnpm run build` and `pnpm test`.
