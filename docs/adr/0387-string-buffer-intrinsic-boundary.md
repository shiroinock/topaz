# 0387 - string buffer intrinsic boundary

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.60

## Context

After Phase 3.59, public `String.prototype.charCodeAt(...)` semantics moved to
the runtime prelude. The `needs-string-buffer-intrinsics` migration lane now has
only two C substrate symbols left: raw byte reads through
`topaz_string_byte_at(...)` and byte-preserving materialization through
`topaz_string_from_byte_codes(...)`. The migrated string helpers now put their
algorithmic behavior in `runtime/prelude.ts`, while these two helpers are
representation access and materialization substrate.

## Decision

Pin the current string-buffer lane to exactly `topaz_string_byte_at(...)` and
`topaz_string_from_byte_codes(...)`. Future migration on this lane requires
compiler-owned internal string-buffer intrinsics first: opaque string-buffer
allocation, byte append/copy/read operations, materialization to immutable
`string`, and hidden lowering usable only from runtime prelude modules.

Rejected alternatives: reimplementing `topaz_string_from_byte_codes(...)` in
ordinary Topaz-subset TS was rejected because it is the current byte-preserving
materialization primitive, and `String.fromCharCode`, concat, repeat, and slice
already route through migrated helpers that depend on it. Treating
`Array<number>` as the final internal representation was rejected because it is
temporary and inefficient. Replacing `topaz_string_byte_at(...)` was rejected
because public `charCodeAt` semantics are already in the prelude, but raw byte
reads still require representation access until a dedicated internal byte-read
intrinsic exists.

## Implementation

- `scripts/check-runtime-substrate.mjs:40` defines the pinned symbol set;
  `scripts/check-runtime-substrate.mjs:458` validates the discovered lane;
  `scripts/check-runtime-substrate.mjs:508` names missing or unexpected symbols;
  `scripts/check-runtime-substrate.mjs:536` prints the deterministic boundary
  line on success.
- `tests/smoke.sh:11` captures checker output and `tests/smoke.sh:17` makes
  `runtime_substrate_inventory` fail if the boundary line disappears or no
  longer names both symbols, while keeping the existing unclassified-helper
  probe.
- `docs/runtime-ts-migration.md:60` describes the pinned terminal boundary and
  `docs/runtime-ts-migration.md:260` explains why ordinary Topaz-subset TS is
  no longer the right migration mechanism for these symbols.
- `MEMO.md:301` records the Phase 3.60 checkpoint.

## Consequences

- **Accepted**: `pnpm run check:runtime-substrate` succeeds on the real
  `runtime/runtime.h` and reports the pinned string-buffer boundary.
- **Rejected**: adding a third `needs-string-buffer-intrinsics` symbol or
  removing either pinned symbol now fails with a diagnostic naming the changed
  symbol.
- **Regression**: `runtime_substrate_inventory` covers the success path and
  keeps the existing unclassified-symbol failure probe.
- **Scope outside**: no runtime helper migration, no `StringBuffer`, no public
  intrinsic API, and no changes to runtime behavior, generated C behavior,
  public diagnostics, examples, or release behavior.
