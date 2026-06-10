# 0412 - c abi type substrate policy

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.85

## Context

Runtime TS migration has closed the ordinary string and BigInt helper lanes in
ADR [0406](./0406-legacy-runtime-migration-lanes-closed.md) / ADR
[0407](./0407-closed-runtime-migration-guidance.md), then pinned the
`libc-libm-boundary`, `host-abi-boundary`, `raw-memory-boundary`, and
`exception-boundary` lanes in ADR [0408](./0408-libc-libm-number-substrate-policy.md),
ADR [0409](./0409-host-abi-substrate-policy.md), ADR
[0410](./0410-raw-memory-substrate-policy.md), and ADR
[0411](./0411-exception-substrate-policy.md). The remaining C ABI type entries
are different from helper algorithms because they define C type, layout, header,
and optional sentinel shapes shared by generated C and runtime macros.

## Decision

Keep the eight current `c-abi-type-boundary` entries as the pre-v0.2
generated-C/runtime ABI type substrate: `TOPAZ_RUNTIME_H`,
`topaz_opt_wrap_number`, `topaz_opt_wrap_boolean`, `topaz_opt_wrap_string`,
`topaz_opt_absent_number`, `topaz_opt_absent_boolean`,
`topaz_opt_absent_string`, and `topaz_opt_passthrough`. Future movement
requires an explicit generated-C ABI/type-layout/backend design that changes
the shared optional/layout representation as a unit. Rejected alternatives:
rewriting optional wrappers in `runtime/prelude.ts` was rejected because these
are C compound literals/macros and type shapes used by generated C, not ordinary
runtime algorithms; changing scalar optional representation now was rejected
because it would alter `T | undefined`, `Map.get`, optional chaining, nullish
coalescing, and generated C ABI expectations; moving `TOPAZ_RUNTIME_H` out of
the inventory was rejected because the header guard represents the embedded
runtime header boundary used by freshness checks and generated runtime output.

## Implementation

- `scripts/check-runtime-substrate.mjs:47` updates `NEXT.C_ABI_TYPE` to name the
  pinned pre-v0.2 generated-C/runtime ABI type substrate, the eight entries,
  optional wrapper / absent / passthrough shapes, generated C and runtime macro
  shared ABI/layout concerns, and the required future ABI/type-layout/backend
  decision.
- `tests/smoke.sh:52` asserts that the normal substrate summary still includes
  `c-abi-type-boundary: 8`.
- `docs/runtime-ts-migration.md:149` documents the Phase 3.85 C ABI type
  substrate policy and explains why this lane is not a helper-by-helper runtime
  prelude migration target.
- `MEMO.md:326` records Phase 3.85 as a checker/docs/test-only policy pin.

## Consequences

- **Accepted**: the header guard, scalar optional wrap/absent macros, and
  `topaz_opt_passthrough` remain visible as the eight-entry
  `c-abi-type-boundary` lane.
- **Accepted**: later optional/layout migration must start from an explicit
  generated-C ABI/type-layout/backend design instead of migrating these entries
  independently.
- **Rejected**: runtime behavior, scalar optional representation, generated C
  ABI expectations, and the embedded runtime header boundary do not change in
  this phase.
- **Regression**: `pnpm run check:runtime-substrate` reports
  `c-abi-type-boundary: 8`, and `pnpm test` now asserts that lane count in the
  main smoke gate.
- **Scope外**: `runtime/runtime.h`, `runtime/prelude.ts`,
  `src/runtime_header.ts`, `src/runtime_prelude.ts`, `src/codegen.ts`, runtime
  behavior, syntax support, optional representation, and lowering are unchanged.
