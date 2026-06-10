# 0410 - raw memory substrate policy

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.83

## Context

Runtime TS migration has closed the ordinary string and BigInt helper lanes in
ADR [0406](./0406-legacy-runtime-migration-lanes-closed.md) / ADR
[0407](./0407-closed-runtime-migration-guidance.md), pinned the three
`libc-libm-boundary` number helpers in ADR
[0408](./0408-libc-libm-number-substrate-policy.md), and pinned the twelve
`host-abi-boundary` helpers in ADR
[0409](./0409-host-abi-substrate-policy.md). Arena allocation remains below
those higher-level families as the storage foundation for generated C and
runtime substrate helpers. Topaz source currently cannot express raw pointers,
byte buffers, arena lifetimes, memcpy, allocation failure behavior, or ownership
safely.

## Decision

Keep the three arena helpers in `raw-memory-boundary` before v0.2.0:
`topaz_arena_alloc(...)`, `topaz_arena_calloc(...)`, and
`topaz_arena_realloc(...)`. Treat future movement as an explicit
compiler-owned memory intrinsic or backend storage replacement ADR. Runtime
prelude algorithms may depend on higher-level compiler-owned substrates such as
`StringBuffer` and `BigIntBuffer`, but they must not model arena pointers
directly in Topaz source. Rejected alternatives: migrating arena allocation
helpers now was rejected because Topaz source has no raw pointer, byte buffer,
or ownership model; adding public unsafe pointer APIs now was rejected as a
major language/runtime design outside migration closeout; closing
`raw-memory-boundary` was rejected because the three active arena primitives
remain foundational; reclassifying arena helpers into StringBuffer or
BigIntBuffer families was rejected because those families are clients of arena
storage, not allocator replacements.

## Implementation

- `scripts/check-runtime-substrate.mjs:31` updates `NEXT.RAW_MEMORY` to name
  the pinned pre-v0.2 compiler-owned raw memory / arena substrate boundary and
  the three helper responsibilities.
- `tests/smoke.sh:32` asserts that the normal substrate summary still includes
  `raw-memory-boundary: 3`.
- `docs/runtime-ts-migration.md:108` documents the Phase 3.83 raw memory
  substrate policy and explains why runtime prelude code must stay above
  `StringBuffer`, `BigIntBuffer`, or other safe compiler-owned substrates.
- `MEMO.md:324` records Phase 3.83 as a checker/docs/test-only policy pin.

## Consequences

- **Accepted**: `topaz_arena_alloc`, `topaz_arena_calloc`, and
  `topaz_arena_realloc` remain visible as the three-symbol
  `raw-memory-boundary` lane.
- **Accepted**: later compiler/backend work can revisit memory ownership,
  allocation failure, and storage representation with an explicit substrate
  replacement design.
- **Rejected**: helper-by-helper runtime prelude migration no longer applies to
  raw arena allocation helpers.
- **Regression**: `pnpm run check:runtime-substrate` reports
  `raw-memory-boundary: 3`, and `pnpm test` now asserts that lane count in the
  main smoke gate.
- **Scope外**: runtime behavior, generated C lowering, public APIs,
  `runtime/runtime.h`, `runtime/prelude.ts`, generated runtime files, memory
  implementation, manifest/capability behavior, doctor/check/explain commands,
  and `src/codegen.ts` are unchanged.
