# 0267 - call expression emitCallArgs anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0266](./0266-method-dispatch-diagnostic-anchors.md) advanced the self-host
probe to `src/codegen.ts:8106:11`. The reached blocker was ordinary
call-expression argument lowering: `emitCallArgs` already takes a small
`{ pos: number }` diagnostic anchor, and constructor calls had been normalized
earlier, but generic calls, direct calls, class methods, and interface methods
still passed the full `CallExpr`.

## Decision

Preserve call lowering and pass explicit call-position anchors to every
ordinary call-expression `emitCallArgs` caller. Generic and direct function
calls now bind a local `{ pos: expr.pos }` anchor before argument emission, and
class/interface method calls pass the same small anchor shape inline. Rejected
alternatives: broadening `emitCallArgs` back to full `CallExpr` values was
rejected because the helper contract only needs a source position; changing
function or method resolution was rejected as unrelated; sweeping every
remaining call diagnostic was rejected as broader than the current blocker.

## Implementation

- `src/codegen.ts:8102`: generic function calls now pass a local
  call-position anchor to `emitCallArgs`.
- `src/codegen.ts:8113`: direct function calls now pass a local call-position
  anchor to `emitCallArgs`.
- `src/codegen.ts:9253`: class method calls now pass `{ pos: expr.pos }` for
  argument arity and omitted optional-parameter diagnostics.
- `src/codegen.ts:9277`: interface method calls now pass `{ pos: expr.pos }`
  for the same argument lowering path.

## Consequences

- **Accepted**: generic calls, direct calls, class methods, and interface
  methods keep the same lowering, arity checks, optional-argument synthesis,
  and generated C call spelling.
- **Rejected**: spread calls and other new call forms remain unsupported.
- **Regression**: no examples were added because observable behavior and
  diagnostic messages/positions are unchanged; build, self-host probe, and
  smoke tests remain the guard.
- **Self-host**: the old `src/codegen.ts:8106:11` call-expression anchor
  blocker is removed. The next probe blocker is recorded in the phase outcome.
- **Scope out**: broader built-in and call diagnostic cleanup remains for later
  phases.
