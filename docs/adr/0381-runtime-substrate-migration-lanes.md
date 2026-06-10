# 0381 - runtime substrate migration lanes

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.54

## Context

ADR [0372](./0372-runtime-substrate-inventory-check.md) made remaining
`runtime/runtime.h` helpers and substrate macros auditable by requiring a
category and reason for each symbol. After phases 3.46 through 3.53, the header
has mostly shrunk to deliberate substrate boundaries: raw memory, host ABI,
libc/libm formatting, exception jumps, container monomorphs, string allocation,
BigInt limbs, and ABI-visible type shapes. The checker still could not tell
which prerequisite or lane kept each remaining symbol in C.

## Decision

Extend the runtime substrate inventory metadata with `migration` and `next` for
every classified symbol. The migration lane is a short stable bucket for the
remaining prerequisite, and `next` states the concrete prerequisite or reason
the symbol is pinned to C. The checker now validates all four fields and prints
a deterministic migration-lane count summary after the existing category
summary.

Rejected alternatives: keeping lane interpretation only in prose was rejected
because stale docs would not fail smoke; adding per-lane migration work in this
phase was rejected because this is a checker/docs hardening slice; splitting
the inventory into multiple files was rejected because one audited table is
easier to keep synchronized with `runtime/runtime.h`.

## Implementation

- `scripts/check-runtime-substrate.mjs:18` defines the eight migration lane
  names and shared `next` prerequisites, and
  `scripts/check-runtime-substrate.mjs:40` attaches `migration` / `next`
  metadata to each inventory entry.
- `scripts/check-runtime-substrate.mjs:476` validates that every inventory entry
  has `category`, `reason`, `migration`, and `next`, and
  `scripts/check-runtime-substrate.mjs:528` prints sorted category and
  migration-lane counts.
- `tests/smoke.sh:11` captures normal substrate checker output and fails if the
  `migration lanes:` summary disappears while preserving the unclassified
  helper failure probe.
- `docs/runtime-ts-migration.md:28` documents the stronger checker contract and
  `docs/runtime-ts-migration.md:37` interprets each remaining migration lane.
- `MEMO.md:295` records phase 3.54 as a completed checker/docs hardening phase.

## Consequences

- **Accepted**: `pnpm run check:runtime-substrate` now fails for inventory
  entries missing `category`, `reason`, `migration`, or `next`.
- **Accepted**: normal checker output reports both category counts and
  migration-lane counts in deterministic order.
- **Regression**: `tests/smoke.sh` locks the lane summary and the existing
  unclassified-helper failure behavior.
- **Scope outside**: no runtime helper, generated C behavior, lowering target,
  stdlib surface, package lookup, release artifact, or manifest/doctor behavior
  changes in this phase.
