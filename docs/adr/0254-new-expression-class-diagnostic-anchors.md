# 0254 - new expression class diagnostic anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0253](./0253-new-expression-callee-narrowing-cleanup.md) normalized
new-expression callee narrowing. The self-host probe then advanced to
`src/codegen.ts:7593:30`, where `emitNewExpression` still passed a full
`NewExpr` to `CodegenError` on class/interface diagnostics. That object is
wider than the diagnostic anchor shape the self-hosted compiler can lower, so
the next unblocker is anchor normalization rather than syntax coverage.

## Decision

Preserve all `new` expression semantics and use an explicit `{ pos: expr.pos }`
anchor for class/interface/unsupported constructor diagnostics after the callee
has been narrowed. Rejected alternatives: broadening `CodegenError` to accept
arbitrary AST node shapes was rejected because recent cleanup phases use small
anchor objects at diagnostic sites; changing interface or class construction
semantics was rejected because the blocker is only diagnostic lowering; adding
new examples was rejected because user-visible behavior is unchanged.

## Implementation

- `src/codegen.ts:7592`: `emitNewExpression` now introduces `newAnchor` after
  collection constructor dispatch and uses it for interface construction,
  generic class instantiation diagnostics, non-generic class type arguments,
  concrete expected-type mismatch, no-constructor argument mismatch, and
  unsupported `new` diagnostics.
- `src/codegen.ts:10292`: infer-side `new_expr` typing now uses the same
  anchor style for generic class instantiation diagnostics, concrete class
  type-argument, interface construction, and unsupported constructor
  diagnostics.

## Consequences

- **Accepted**: supported class construction, generic class construction,
  `new Map<K, V>()`, contextual bare `new Map()`, `new Set<T>()`, contextual
  bare `new Set()`, and iterable `new Set<T>(source)` keep the same lowering.
- **Rejected**: `new` on interfaces, type arguments on non-generic classes,
  mismatched expected concrete construction, arguments to empty no-constructor
  classes, and unknown constructors keep the same user-facing diagnostics.
- **Regression**: no examples were added because this only changes diagnostic
  anchor representation; existing smoke coverage remains the regression guard.
- **Self-host**: the old `src/codegen.ts:7593:30` diagnostic-anchor blocker is
  removed. The next blocker is recorded in the phase outcome JSON.
- **Scope out**: broader constructor support, generic class behavior changes,
  and general `CodegenError` anchor typing remain outside this phase.
