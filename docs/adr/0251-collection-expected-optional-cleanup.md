# 0251 - collection expected optional cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0250](./0250-collection-indexed-non-null-cleanup.md) removed redundant
collection indexed-read non-null assertions. The self-host probe then advanced
to `src/codegen.ts:7525:12`, where `resolveArrayLiteralType` used
`!expected` on a `TopazType | undefined` value. Topaz conditions are strict
boolean, so optional presence in the compiler source must be tested explicitly
instead of relying on object truthiness.

## Decision

Preserve collection literal, `Map` / `Set` constructor, and class `new`
expected-type behavior while replacing optional `expected` truthiness with
explicit `expected === undefined` / `expected !== undefined` checks in the
collection constructor helper region. Rejected alternatives: adding optional
object truthiness was rejected because it weakens strict boolean conditions;
sweeping broader optional-value cleanup was rejected as outside this phase;
changing collection inference, expected-type coercion, or constructor behavior
was rejected as unrelated to the source-shape blocker.

## Implementation

- `src/codegen.ts:7525`: empty array contextual typing now checks
  `expected === undefined` before the array-type guard.
- `src/codegen.ts:7533`: non-empty array contextual typing narrows
  `expected !== undefined` before testing `isArrayType(expected)`.
- `src/codegen.ts:7612`: class `new` expected-type validation keeps the same
  class/interface assignability check behind an explicit expected-value guard.
- `src/codegen.ts:7641` and `src/codegen.ts:7649`: `Map` constructor declared
  and contextual type checks use explicit undefined handling.
- `src/codegen.ts:7711` and `src/codegen.ts:7719`: `Set` constructor declared
  and contextual type checks use explicit undefined handling.

## Consequences

- **Accepted**: context-typed empty arrays, context-typed array literals,
  explicit and contextual `new Map` / `new Set`, iterable `new Set`, and class
  `new` expected class/interface assignability remain unchanged.
- **Rejected**: empty arrays without contextual `Array<T>`, bare `new Map()` /
  `new Set()` without contextual collection type, expected-type mismatches, and
  unsupported collection monomorphs remain rejected by the existing paths.
- **Regression**: no examples were added because observable behavior is
  unchanged; existing spread, Map, Set, class/interface, and non-boolean
  condition coverage passed in `pnpm test` across 280 smoke entries.
- **Self-host**: the old `src/codegen.ts:7525:12` optional-truthiness blocker is
  resolved. The probe now stops at `src/codegen.ts:7543:10: type mismatch:
  expected topaz_boolean, got topaz_union_dunion_anon_50_or_anon_51_or_anon_52_or_anon_53_or_anon_54_or_anon_55_or_anon_56_or_anon_57_or_anon_58_or_anon_59_or_anon_60_or_anon_61_or_anon_62_or_anon_63_or_anon_64_or_anon_86_or_undefined`.
- **Scope out**: adjacent optional result checks such as `if (!arr)`, broader
  truthiness cleanup, and collection semantics changes remain outside this
  phase.
