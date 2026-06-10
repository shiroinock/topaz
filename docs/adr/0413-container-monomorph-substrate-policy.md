# 0413 - container monomorph substrate policy

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.86

## Context

Runtime TS migration has closed the ordinary string and BigInt helper lanes in
ADR [0406](./0406-legacy-runtime-migration-lanes-closed.md) / ADR
[0407](./0407-closed-runtime-migration-guidance.md), then pinned the
`libc-libm-boundary`, `host-abi-boundary`, `raw-memory-boundary`,
`exception-boundary`, and `c-abi-type-boundary` lanes in ADR
[0408](./0408-libc-libm-number-substrate-policy.md), ADR
[0409](./0409-host-abi-substrate-policy.md), ADR
[0410](./0410-raw-memory-substrate-policy.md), ADR
[0411](./0411-exception-substrate-policy.md), and ADR
[0412](./0412-c-abi-type-substrate-policy.md). The remaining container entries
are different from helper algorithms because they define monomorphized C
type/layout/function families and hash/equality semantics shared by generated C
and runtime macros.

## Decision

Keep the thirteen current `container-monomorph-boundary` entries as the
pre-v0.2 compiler-owned container monomorph substrate: `topaz_string_eq`,
`TOPAZ_ARRAY_DEFINE`, `TOPAZ_HASH_SLOT_EMPTY`,
`TOPAZ_HASH_SLOT_OCCUPIED`, `TOPAZ_HASH_SLOT_TOMBSTONE`,
`topaz_hash_number`, `topaz_key_eq_number`, `topaz_hash_boolean`,
`topaz_hash_pointer`, `topaz_key_eq_boolean`, `topaz_hash_string`,
`TOPAZ_MAP_DEFINE`, and `TOPAZ_SET_DEFINE`. Future movement requires an
explicit compiler-owned container monomorphization/backend design that replaces
the Array/Map/Set substrate as a unit. Rejected alternatives: rewriting the
macro families in `runtime/prelude.ts` was rejected because Topaz source cannot
currently generate C typedefs, struct layouts, or concrete functions per
container type; moving hash/equality helpers one by one was rejected because
Map/Set macro families, generated C monomorph emission, and key equality
semantics are coupled; changing Map/Set/Array representation now was rejected
because this phase only documents and guards the existing boundary.

## Implementation

- `scripts/check-runtime-substrate.mjs:40` updates
  `NEXT.CONTAINER_MONOMORPH` to name the pinned pre-v0.2 compiler-owned
  container monomorph substrate, Array/Map/Set macro families, hash-table slot
  state, growth/rehash/tombstones, SameValueZero number equality, string byte
  hashing/equality, reference identity, and the required future
  container-monomorphization/backend decision.
- `tests/smoke.sh:52` asserts that the normal substrate summary still includes
  `container-monomorph-boundary: 13`.
- `docs/runtime-ts-migration.md:167` documents the Phase 3.86 container
  monomorph substrate policy and explains why this lane is not a
  helper-by-helper runtime prelude migration target.
- `MEMO.md:327` records Phase 3.86 as a checker/docs/test-only policy pin.

## Consequences

- **Accepted**: Array/Map/Set macro families, hash slot state, hash helpers,
  and key equality helpers remain visible as the thirteen-entry
  `container-monomorph-boundary` lane.
- **Accepted**: later container migration must start from an explicit
  compiler-owned container monomorphization/backend design instead of migrating
  these entries independently.
- **Rejected**: runtime behavior, container representation, generated C
  monomorph emission, hash-table growth/rehash/tombstone behavior, and key
  equality semantics do not change in this phase.
- **Regression**: `pnpm run check:runtime-substrate` reports
  `container-monomorph-boundary: 13`, and `pnpm test` now asserts that lane
  count in the main smoke gate.
- **Scope外**: `runtime/runtime.h`, `runtime/prelude.ts`,
  `src/runtime_header.ts`, `src/runtime_prelude.ts`, `src/codegen.ts`, runtime
  behavior, syntax support, container representation, and lowering are
  unchanged.
