# 0289 - optional local truthiness cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0288](./0288-capturecontext-infertype-identifier-narrowing.md) advanced the
self-host probe to `inferType(prop_access)`, where a local
`TopazType | undefined` result from `dunionCommonFieldType(...)` was tested as
`if (common) return common`. Topaz conditions are strict `boolean`, so optional
locals in compiler source must be checked with explicit undefined comparisons.
The same local optional-value truthiness pattern was present in adjacent
logical-narrowing, object-literal contextual typing, undefined-literal, and
coercion paths.

## Decision

Keep strict boolean conditions unchanged and rewrite this grouped set of local
`T | undefined` truthiness checks to `=== undefined` / `!== undefined`.
Rejected alternatives: loosening conditions for `T | undefined` was rejected
because strict boolean conditions are a core subset rule; adding general
truthiness semantics was rejected because it would change the language surface;
sweeping every `if (...)` in `src/codegen.ts` was rejected because this phase is
only a self-host source cleanup; changing dunion common-field or object-literal
behavior was rejected because existing semantics already pass their regression
tests.

## Implementation

- `src/codegen.ts:9794`: returns a dunion common field only after
  `common !== undefined`.
- `src/codegen.ts:10048`: applies logical `&&` / `||` narrowing only after
  `extractNarrowing(...) !== undefined`.
- `src/codegen.ts:10704`: strips contextual `T | undefined` object-literal
  targets with `inner !== undefined` before recursing.
- `src/codegen.ts:10720`: checks object-literal discriminator locals,
  class-info lookups, variant fields, matched variants, and stored property
  values with explicit undefined comparisons.
- `src/codegen.ts:10899`: rejects impossible undefined literals with
  `inner === undefined`.
- `src/codegen.ts:10939`: narrows optional coercion inners before checking
  assignability and wrapping scalar optionals.

## Consequences

- **Accepted**: dunion common fields still infer when every variant exposes the
  same field type.
- **Accepted**: logical `&&` / `||` narrowing still applies when
  `extractNarrowing(...)` returns a narrowing record.
- **Accepted**: object literal contextual typing, missing-property diagnostics,
  and dunion variant selection are unchanged.
- **Rejected**: missing discriminators, missing object properties, and
  non-common dunion fields still use the existing diagnostics.
- **Regression**: no examples were added because existing
  `dunion_common_field`, `compound_narrow`, object-literal, and fail-case smoke
  coverage plus the self-host probe cover this source cleanup;
  `tests/smoke.sh` remains at 282 primary compile/run/fail checks including CLI
  failure checks.
- **Self-host**: the old `src/codegen.ts:9795:13` optional-local truthiness
  blocker is removed; any later probe blocker is a separate phase.
- **Scope out**: broader truthiness support, Map key-sensitive narrowing, and
  a whole-file optional-truthiness sweep remain out of scope.
