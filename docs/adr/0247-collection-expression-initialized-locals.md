# 0247 - collection expression initialized locals

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0246](./0246-conditional-result-diagnostic-anchor.md) advanced the self-host
probe to `src/codegen.ts:7443:5: variable declaration must have an
initializer`. The blocker was not collection semantics; it was TypeScript-style
definite assignment in `Emitter.emitArrayLiteral`, where collection helper
locals were declared first and assigned in later branches.

Topaz intentionally requires initialized `let` / `const` declarations, so the
compiler source has to express collection expression lowering inside that
subset while preserving the existing array literal, spread, Map, Set,
`Array.includes`, and `Array.join` behavior.

## Decision

Preserve collection semantics and rewrite the local source shape to initialized
`const` / helper-return form in the collection expression helpers owned by this
phase. Array literal element/type selection, Map constructor type selection,
Set constructor type selection, includes equality selection, and join separator
selection now return values from small helpers instead of relying on
uninitialized locals that are assigned later.

Rejected alternatives: relaxing Topaz to allow uninitialized `let` was rejected
because the initialized-local divergence is already fixed. Adding definite
assignment analysis was rejected as a language feature, not a source cleanup.
Dummy sentinel initializers were rejected because they obscure the invariant
that successful collection paths compute real Array / Map / Set types.
Sweeping unrelated uninitialized locals in `src/codegen.ts` was rejected as too
broad for this phase.

## Implementation

- `src/codegen.ts:7443`: `emitArrayLiteral` now receives an initialized
  `arrType` from `resolveArrayLiteralType`.
- `src/codegen.ts:7504`: `firstArrayLiteralElementType` shares the first-element
  inference path between emit-side and infer-side array literal handling.
- `src/codegen.ts:7577` and `src/codegen.ts:7689`: Map and Set constructor
  branches now use helper-return type resolution.
- `src/codegen.ts:8348` and `src/codegen.ts:8407`: `Array.includes` equality
  and `Array.join` separator selection now use initialized helper results.
- `src/codegen.ts:9730`: infer-side array literal handling no longer declares an
  uninitialized first-element local.

## Consequences

- **Accepted**: empty context-typed arrays, non-empty and spread array literals,
  Map / Set constructors, Set iterable construction, `Array.includes`, and
  scalar `Array.join` remain unchanged.
- **Rejected**: uncontextual empty arrays, invalid spread sources, Map / Set
  inference without context, unsupported monomorphs, unsupported includes
  element types, and non-string join separators remain unchanged.
- **Regression**: no examples were added because observable behavior is
  unchanged; existing spread, array method, Map, Set, and iterator coverage
  remains authoritative across the 280 smoke cases.
- **Self-host**: the old `src/codegen.ts:7443:5` initialized-local blocker is
  resolved. The probe now stops at
  `src/codegen.ts:7468:13: type mismatch: expected topaz_class_anon_88, got
  topaz_dunion_...`.
- **Scope out**: broader definite-assignment support, new collection semantics,
  and unrelated compiler-source uninitialized locals remain outside this phase.
