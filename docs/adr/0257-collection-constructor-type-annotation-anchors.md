# 0257 - collection constructor type-annotation anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0256](./0256-new-expression-constructor-call-arg-anchor.md) advanced the
self-host probe to `src/codegen.ts:7638:59`. The Map constructor helper already
used `{ pos: expr.pos }` for its own `CodegenError` diagnostics, but its
`typeFromAnnotation` calls still passed the full `NewExpr` node. The self-hosted
compiler cannot coerce that full node object to the smaller diagnostic-anchor
shape used by annotation parsing.

## Decision

Preserve Map and Set constructor semantics and normalize the reached collection
constructor type-annotation anchors to explicit `{ pos: expr.pos }` objects.
Rejected alternatives: broadening `typeFromAnnotation` to accept full AST nodes
was rejected because its diagnostic contract is already the small anchor shape;
changing Map / Set constructor inference or monomorph recording was rejected
because the reached blocker is only anchor representation; sweeping unrelated
`typeFromAnnotation(..., expr, ...)` sites was rejected as too broad for this
phase.

## Implementation

- `src/codegen.ts:7637`: `resolveMapConstructorType` now creates one
  constructor anchor and passes it to both `Map<K, V>` annotation conversions
  and existing constructor-position diagnostics.
- `src/codegen.ts:7709`: `resolveSetConstructorDeclaredType` now uses the same
  small constructor anchor for `Set<T>` annotation conversion and diagnostics.
- `src/codegen.ts:10278`: infer-side `new Map<K, V>()` typing now uses a local
  constructor anchor for annotation conversion and Map constructor diagnostics.

## Consequences

- **Accepted**: `new Map<K, V>()`, contextual bare `new Map()`,
  `new Set<T>()`, contextual bare `new Set()`, and iterable `new Set<T>(source)`
  keep their existing behavior.
- **Rejected**: Map constructor iterable input, invalid Map / Set type-argument
  arity, and unsupported monomorphs remain rejected by existing paths.
- **Regression**: no examples were added because observable behavior is
  unchanged; existing build, self-host probe, and smoke tests remain the guard.
- **Self-host**: the old `src/codegen.ts:7638:59` Map annotation-anchor blocker
  is removed. The next blocker is recorded in the phase outcome JSON.
- **Scope out**: broader annotation-anchor cleanup remains outside this phase.
