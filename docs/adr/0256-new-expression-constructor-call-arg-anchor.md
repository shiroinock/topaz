# 0256 - new expression constructor call-arg anchor

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0255](./0255-new-expression-constructor-optional-cleanup.md) made constructor
presence explicit and advanced the self-host probe to `src/codegen.ts:7627:71`.
The concrete-class `new` branch already normalizes local diagnostics through
`newAnchor`, but the constructor argument path still passed the full `NewExpr`
to `emitCallArgs`. That helper only needs the small `{ pos: number }` diagnostic
anchor shape.

## Decision

Preserve constructor argument semantics and pass the existing `newAnchor` when
class constructor calls delegate to `emitCallArgs`. Rejected alternatives:
broadening `emitCallArgs` to accept arbitrary AST node objects was rejected
because its contract is already the small anchor shape; reworking every
call-argument anchor site was rejected as too broad for this self-host blocker;
changing constructor arity or optional-parameter lowering was rejected because
the reached issue is only the diagnostic anchor passed by the `new` path.

## Implementation

- `src/codegen.ts:7627`: constructor argument lowering now calls
  `emitCallArgs(args, params, label, newAnchor)` before joining the generated C
  arguments.
- `src/codegen.ts:10707`: `emitCallArgs` remains unchanged and continues to
  perform the existing arity check, expected-type emission, and omitted optional
  parameter lowering through its `{ pos: number }` anchor.

## Consequences

- **Accepted**: classes with constructors keep the same arity/type checking,
  optional parameter behavior, and C constructor call lowering.
- **Rejected**: no new constructor forms are accepted, and call-expression
  argument behavior is unchanged.
- **Regression**: no examples were added because observable behavior is
  unchanged; existing build, self-host probe, and smoke tests remain the guard.
- **Self-host**: the old `src/codegen.ts:7627:71` constructor call-argument
  anchor blocker is removed. The next blocker is recorded in the phase outcome
  JSON.
- **Scope out**: broader call-site cleanup and constructor semantics changes
  remain outside this phase.
