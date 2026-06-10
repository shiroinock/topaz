# 0406 - legacy runtime migration lanes closed

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.79

## Context

ADR [0395](./0395-remove-string-byte-read-substrate.md) emptied the
`needs-string-buffer-intrinsics` lane after `String.prototype.charCodeAt`
stopped depending on a runtime-header byte-read helper. ADR
[0405](./0405-bigint-decimal-formatting-prelude.md) then removed the final
standalone `needs-bigint-limb-intrinsics` helper by moving decimal BigInt
formatting to the runtime prelude. Both legacy lanes are now completed
migration history. Leaving them as ordinary empty buckets would let future C
helpers quietly re-enter old cleanup lanes instead of forcing a fresh substrate
decision.

## Decision

Make `needs-string-buffer-intrinsics` and `needs-bigint-limb-intrinsics` closed
migration lanes in `scripts/check-runtime-substrate.mjs`. The checker keeps the
active `string-buffer-intrinsic-family` and `bigint-limb-intrinsic-family`
lanes, but any discovered runtime symbol classified into either closed legacy
lane is now an inventory error that names the lane and symbol. Rejected
alternatives: migrating `topaz_fmod`, `topaz_parse_float`, or
`topaz_number_to_string` now was rejected because libc/libm compatibility needs
a separate number-substrate decision; starting container monomorph replacement
was rejected because it is compiler-owned storage work; removing the active
StringBuffer or BigIntBuffer intrinsic families was rejected because runtime
prelude helpers still need those explicit compiler-owned substrates.

## Implementation

- `scripts/check-runtime-substrate.mjs:44` defines the closed lane set,
  `scripts/check-runtime-substrate.mjs:429` validates discovered symbols
  against it, and `scripts/check-runtime-substrate.mjs:502` prints the
  deterministic success summary.
- `tests/smoke.sh:17` asserts both closed legacy lanes,
  `tests/smoke.sh:32` preserves the active intrinsic-family count checks, and
  `tests/smoke.sh:55` adds a focused closed-lane checker probe while keeping
  the unclassified-helper probe.
- `docs/runtime-ts-migration.md:56` describes the legacy `needs-*` lanes as
  closed checker invariants, and `docs/runtime-ts-migration.md:142` names the
  remaining pinned runtime work.
- `MEMO.md:320` records Phase 3.79 as a checker/docs/test-only closeout.

## Consequences

- **Accepted**: future runtime inventory entries can still use pinned
  raw-memory, libc/libm, container-monomorph, host ABI, exception, and C ABI
  boundaries, or the active StringBuffer / BigIntBuffer intrinsic families.
- **Rejected**: future symbols cannot reappear in the completed
  `needs-string-buffer-intrinsics` or `needs-bigint-limb-intrinsics` lanes
  without failing the substrate checker.
- **Regression**: `pnpm run check:runtime-substrate` prints the closed-lane
  summary; `pnpm test` asserts it and verifies a focused closed-lane failure.
- **Scope外**: runtime behavior, generated C lowering, `runtime/runtime.h`, and
  numeric / container substrate migrations are unchanged.
