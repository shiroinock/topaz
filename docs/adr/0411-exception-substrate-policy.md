# 0411 - exception substrate policy

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.84

## Context

Runtime TS migration has closed the ordinary string and BigInt helper lanes in
ADR [0406](./0406-legacy-runtime-migration-lanes-closed.md) / ADR
[0407](./0407-closed-runtime-migration-guidance.md), pinned the three
`libc-libm-boundary` number helpers in ADR
[0408](./0408-libc-libm-number-substrate-policy.md), pinned the twelve
`host-abi-boundary` helpers in ADR
[0409](./0409-host-abi-substrate-policy.md), and pinned the three
`raw-memory-boundary` arena helpers in ADR
[0410](./0410-raw-memory-substrate-policy.md). The remaining exception helpers
are different from pure helper algorithms because they encode C
control-transfer machinery, frame lifetime, panic diagnostics, and process
abort behavior.

## Decision

Keep the four exception/control-transfer helpers in `exception-boundary` before
v0.2.0: `topaz_try_push(...)`, `topaz_try_pop(...)`, `topaz_throw(...)`, and
`topaz_panic(...)`. Future movement requires an explicit exception
runtime/backend design that replaces the C control-transfer substrate as a
unit. Rejected alternatives: rewriting the helpers in `runtime/prelude.ts` was
rejected because Topaz source cannot express `jmp_buf`, `setjmp`, `longjmp`, or
aborting process control transfer; treating panic as a public TypeScript helper
was rejected because ADR [0377](./0377-runtime-prelude-panic-byte-string-boundary.md)
keeps panic as an internal runtime substrate boundary; changing exception
behavior now was rejected because this phase only documents and guards the
existing boundary.

## Implementation

- `scripts/check-runtime-substrate.mjs:38` updates `NEXT.EXCEPTION` to name the
  pinned pre-v0.2 exception/control-transfer boundary, all four helpers,
  `setjmp` / `longjmp`, `jmp_buf` frame lifetime, panic diagnostics, abort
  control transfer, and the required future exception runtime/backend design.
- `tests/smoke.sh:47` asserts that the normal substrate summary still includes
  `exception-boundary: 4`.
- `docs/runtime-ts-migration.md:128` documents the Phase 3.84 exception
  substrate policy and explains why this lane is not a helper-by-helper runtime
  prelude migration target.
- `MEMO.md:325` records Phase 3.84 as a checker/docs/test-only policy pin.

## Consequences

- **Accepted**: `topaz_try_push`, `topaz_try_pop`, `topaz_throw`, and
  `topaz_panic` remain visible as the four-symbol `exception-boundary` lane.
- **Accepted**: later exception work must start from an explicit
  runtime/backend design instead of migrating these helpers independently.
- **Rejected**: panic does not become a public Topaz helper, and exception
  behavior does not change in this phase.
- **Regression**: `pnpm run check:runtime-substrate` reports
  `exception-boundary: 4`, and `pnpm test` now asserts that lane count in the
  main smoke gate.
- **Scope外**: runtime behavior, generated C lowering, public APIs,
  `runtime/runtime.h`, `runtime/prelude.ts`, generated runtime files,
  exception lowering, panic implementation, and `src/codegen.ts` are unchanged.
