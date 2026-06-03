# 0248 - collection expression diagnostic anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0247](./0247-collection-expression-initialized-locals.md) normalized
initialized locals in collection expression helpers and advanced the self-host
probe to `src/codegen.ts:7468:13: type mismatch: expected topaz_class_anon_88,
got topaz_dunion_...`. The collection behavior was already correct; the
blocker was that collection diagnostics still passed full `Expr` union objects
to `CodegenError`, which only needs a source position and therefore forced the
self-host path through unnecessary anonymous-shape matching.

## Decision

Preserve collection semantics and pass minimal `{ pos }` anchors for
collection-expression diagnostics in the array literal / spread / Map / Set
constructor helper region. Rejected alternatives: broadening `CodegenError` to
accept full expression variants was rejected because diagnostics only need a
position; relaxing anonymous-object assignability was rejected as a type-system
change; adding new spread, Array, Map, or Set semantics was rejected as
unrelated; sweeping every `CodegenError(expr, ...)` in `src/codegen.ts` was
rejected as too broad for this phase.

## Implementation

- `src/codegen.ts:7467`: array literal spread source diagnostics now pass
  `{ pos: e.expr.pos }` instead of the full spread expression source.
- `src/codegen.ts:7510` and `src/codegen.ts:7526`: leading-spread and
  array-literal type-resolution diagnostics use minimal anchors.
- `src/codegen.ts:7552`: collection constructor gates in `emitNewExpression`
  use `{ pos }` anchors for non-identifier `new`, spread arguments,
  `new Array()`, and Map constructor arguments.
- `src/codegen.ts:7632`: Map constructor type diagnostics in
  `resolveMapConstructorType` use `{ pos: expr.pos }`.
- `src/codegen.ts:7656`: Set constructor source diagnostics use
  `{ pos: source.pos }`; Set arity / type-argument diagnostics use
  `{ pos: expr.pos }`.
- `src/codegen.ts:9719` and `src/codegen.ts:10265`: infer-side array literal
  and Map constructor diagnostics use the same minimal array / constructor
  anchors.

## Consequences

- **Accepted**: array literals, array-literal spread, `new Map<K, V>()`,
  context-typed bare `new Map()`, `new Set<T>()`, context-typed bare
  `new Set()`, and iterable `new Set<T>(source)` are unchanged.
- **Rejected**: empty arrays without context, non-array spread sources, spread
  element mismatches, spread in `new` arguments, `new Array()`, Map / Set
  constructor arity and type-argument mistakes, and Set source mismatches are
  unchanged.
- **Regression**: no examples were added because observable behavior is
  unchanged; existing spread, array, Map, Set, and iterator coverage remains
  authoritative across the 280 smoke cases.
- **Self-host**: the old `src/codegen.ts:7468:13` diagnostic-anchor blocker is
  resolved. The probe now stops at
  `src/codegen.ts:7485:27: unknown identifier 'String'`.
- **Scope out**: `String(...)` source cleanup, broader diagnostic-anchor sweeps,
  collection semantic expansion, and anonymous-shape assignability changes
  remain outside this phase.
