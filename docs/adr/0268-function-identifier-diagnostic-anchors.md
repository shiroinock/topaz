# 0268 - function identifier diagnostic anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0267](./0267-call-expression-emit-call-args-anchors.md) advanced the
self-host probe to `src/codegen.ts:8111:56`. The reached blocker was direct
function signature lookup: `resolveFunctionSig` already accepts a narrow
`{ pos: number }` diagnostic anchor, but direct function-call and
identifier-as-function-value paths still passed full identifier expressions.
The final unknown-function diagnostics in those direct call paths also used the
full identifier expression.

## Decision

Preserve function resolution, call lowering, and function-value typing while
normalizing function identifier diagnostics to explicit identifier-position
anchors. Direct function calls and identifier-as-function-value inference now
call `resolveFunctionSig` with `{ pos: ident.pos }`, and direct-call
unknown-function diagnostics use the same small anchor shape. Rejected
alternatives: broadening `resolveFunctionSig` to accept full identifier
expressions was rejected because it only needs a position; changing generic
function resolution or bare function-value behavior was rejected as unrelated;
sweeping every identifier diagnostic in `inferType` was rejected as broader
than the current blocker.

## Implementation

- `src/codegen.ts:8111`: emit-side direct function calls pass
  `{ pos: callee.pos }` into `resolveFunctionSig`.
- `src/codegen.ts:8124`: emit-side unknown-function diagnostics anchor on the
  callee identifier position without passing the full identifier expression.
- `src/codegen.ts:9595`: infer-side identifier-as-function-value lookup passes
  `{ pos: expr.pos }` into `resolveFunctionSig`.
- `src/codegen.ts:10261`: infer-side direct function calls pass
  `{ pos: callee.pos }` into `resolveFunctionSig`.
- `src/codegen.ts:10267`: infer-side unknown-function diagnostics anchor on
  the callee identifier position.

## Consequences

- **Accepted**: direct function calls, generic function calls, fn-typed local
  calls, and top-level function values keep their existing behavior.
- **Rejected**: unknown functions remain compile-time errors, and generic
  functions as bare values remain rejected by existing paths.
- **Regression**: no examples were added because observable behavior,
  diagnostic messages, and diagnostic positions are unchanged; build,
  self-host probe, and smoke tests remain the guard.
- **Self-host**: the old `src/codegen.ts:8111:56` function-signature anchor
  blocker is removed. The next probe blocker is recorded in the phase outcome.
- **Scope out**: broader identifier diagnostic anchor cleanup remains for later
  phases.
