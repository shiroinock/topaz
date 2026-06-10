# 0414 - active intrinsic family substrate policy

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.87

## Context

Runtime TS migration has closed the legacy StringBuffer and BigInt helper lanes
in ADR [0406](./0406-legacy-runtime-migration-lanes-closed.md) / ADR
[0407](./0407-closed-runtime-migration-guidance.md), and the remaining pinned
C boundaries are now explicit through ADR
[0413](./0413-container-monomorph-substrate-policy.md). Two intrinsic-family
lanes remain active because runtime prelude algorithms still use hidden
compiler-owned `StringBuffer` and `BigIntBuffer` pseudo types plus intrinsic
calls as safe allocation, mutable buffer, materialization, and immutable
limb-inspection substrate.

## Decision

Keep the five current `string-buffer-intrinsic-family` entries
`topaz_string_buffer_new`, `topaz_string_buffer_push_byte`,
`topaz_string_buffer_append_string`, `topaz_string_buffer_byte_at`, and
`topaz_string_buffer_to_string`, and the eight current
`bigint-limb-intrinsic-family` entries `topaz_bigint_buffer_new`,
`topaz_bigint_buffer_to_bigint`, `topaz_bigint_buffer_len`,
`topaz_bigint_buffer_get_limb`, `topaz_bigint_buffer_set_limb`,
`topaz_bigint_limb_len`, `topaz_bigint_limb`, and `topaz_bigint_sign` as
active pre-v0.2 internal runtime-prelude substrate families. Future movement
requires an explicit compiler intrinsic/backend representation decision, or
removal after all prelude clients stop needing the family. Rejected
alternatives: reclassifying these helpers into closed legacy lanes was rejected
because those lanes are completed migration history and checker invariants;
rewriting the helpers in `runtime/prelude.ts` was rejected because Topaz source
cannot express mutable byte buffers, mutable limb buffers, raw arena
materialization, or immutable bigint limb storage; treating the hidden pseudo
types as public APIs was rejected because user source must not name
`StringBuffer`, `BigIntBuffer`, or hidden `__topaz_*` intrinsics.

## Implementation

- `scripts/check-runtime-substrate.mjs:44` updates the StringBuffer and
  BigIntBuffer/limb `NEXT` guidance to describe active pre-v0.2
  compiler-owned hidden pseudo-type / intrinsic substrate families, name the
  five and eight entries, distinguish them from the closed legacy lanes, and
  require a future intrinsic/backend representation decision or removal.
- `tests/smoke.sh:62` keeps assertions for
  `bigint-limb-intrinsic-family: 8` and `string-buffer-intrinsic-family: 5`,
  with failure messages that describe active intrinsic-family lane counts.
- `docs/runtime-ts-migration.md:199` adds the Phase 3.87 policy section after
  Phase 3.86.
- `MEMO.md:328` records Phase 3.87 as a checker/docs/test-only policy pin.

## Consequences

- **Accepted**: the StringBuffer and BigIntBuffer/limb families remain
  categorized in their current two active intrinsic-family migration lanes.
- **Accepted**: the checker reports these families as intentional compiler-owned
  internal substrate rather than ambiguous migration backlog.
- **Rejected**: no runtime helper is moved into `runtime/prelude.ts`, no legacy
  closed lane is reopened, and no hidden pseudo type or intrinsic becomes a
  public API.
- **Regression**: `pnpm run check:runtime-substrate` reports
  `string-buffer-intrinsic-family: 5` and `bigint-limb-intrinsic-family: 8`,
  and `pnpm test` asserts both active lane counts.
- **Scope外**: `runtime/runtime.h`, `runtime/prelude.ts`,
  `src/runtime_header.ts`, `src/runtime_prelude.ts`, `src/codegen.ts`, runtime
  behavior, syntax support, intrinsic lowering behavior, and representation are
  unchanged.
