# 0295 - dunion-to-dunion guard nesting cleanup

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 1.5-6i prep

## Context

[0294](./0294-constructor-and-call-args-indexed-non-null-cleanup.md) advanced
the self-host probe to `src/codegen.ts:10753:11`, where the source accessed
`actual.discriminator` after the compound guard
`expected.kind === "dunion" && actual.kind === "dunion"`. The semantics were
already supported by the compiler, but this source shape asked the current
subset to narrow two discriminated values from one compound boolean expression.

## Decision

Rewrite the two dunion-to-dunion branches as nested guards: check
`expected.kind === "dunion"` first, then check `actual.kind === "dunion"`
inside that block before reading dunion-only fields. This follows the older
`typeEq` shape, where one dunion guard is established and the other value is
rejected or narrowed before both values' dunion fields are read. Rejected
alternatives: adding general multi-value `&&` narrowing was rejected because it
is a language/compiler feature decision beyond this cleanup; changing dunion
assignability or widening semantics was rejected because existing behavior is
the intended behavior; touching unrelated `.discriminator` reads was rejected
because they are either already narrowed or intentionally diagnostic-producing.

## Implementation

- `src/codegen.ts:10752` now nests the dunion-to-dunion assignability branch so
  the discriminator comparison and variant-subset loop run only after both
  `expected` and `actual` have explicit dunion guards.
- `src/codegen.ts:11132` now uses the same nested guard shape for
  dunion-to-wider-dunion coercion while preserving the discriminator mismatch
  error, variant membership checks, temporary binding, and re-wrap expression.

## Consequences

- **Accepted**: class-to-dunion assignability and coercion are unchanged.
- **Accepted**: dunion-to-dunion assignability still requires a matching
  discriminator and a source variant set that is a subset of the target.
- **Accepted**: dunion-to-wider-dunion coercion still re-wraps the narrow fat
  struct into the expected typedef without changing the runtime tag or payload.
- **Rejected**: general compound guard narrowing for multiple discriminated
  values remains outside the accepted subset.
- **Regression**: no examples were added because this is a self-host source
  cleanup with no intended observable compiler behavior change.
- **Scope out**: no changes to switch narrowing, dunion field-access
  restrictions, frontend syntax, or runtime representation are included.
