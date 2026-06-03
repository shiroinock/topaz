# 0178. function emission restore cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0177](./0177-signature-params-explicit-void-tail.md) moved the full graph
self-host probe to `src/codegen.ts:3892:15`, where `emitFunctionDefinition`
used `try/finally` to restore function-emission state. The adjacent
`emitMonomorphDefinition` helper used the same state-restore shape for generic
function monomorph emission. [0134](./0134-monomorph-scope-restore-without-finally.md),
[0168](./0168-class-member-emission-cleanup.md),
[0170](./0170-source-context-helper-cleanup.md), and
[0171](./0171-type-annotation-core-cleanup.md) already established normal-path
restore for compiler source cleanup: thrown codegen errors abort the current
compile instead of continuing with restored state.

## Decision

Remove `try/finally` from both plain and monomorph function definition emission.
Each helper now emits its body into a local, builds the final definition string,
then restores lexical scope, return type, live try-frame count, and, for
monomorphs, `typeParamScope` on the normal path before returning.

Rejected alternatives: implementing `finally` lowering is broader language work
and remains outside this source-cleanup phase; changing only
`emitFunctionDefinition` would leave the adjacent monomorph helper with the same
self-host blocker shape; changing function body lowering or emission semantics
would add risk without changing the generated C contract.

## Implementation

- `src/codegen.ts:3875` through `src/codegen.ts:3895` remove
  `emitFunctionDefinition`'s `try/finally`, use an explicit `{ pos: number }`
  parameter anchor, store the rendered definition in a local, and restore state
  before returning.
- `src/codegen.ts:3910` through `src/codegen.ts:3928` apply the same
  normal-path restore pattern to `emitMonomorphDefinition`, including
  `typeParamScope`.
- Function signatures, parameter types, body emission, and generated C text on
  the normal path remain unchanged.

## Consequences

- **Accepted**: plain and generic monomorph function definitions avoid
  `finally` in compiler source.
- **Accepted**: function emission state is restored after successful body
  emission.
- **Accepted**: thrown codegen errors still abort the current compile.
- **Rejected**: no `finally` source support or wider body-lowering change is
  added.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe plus the existing 277 smoke
  checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:3892:15` `finally` blocker and now stops
  at `src/codegen.ts:3937:24` with a strict-boolean type mismatch in
  `inferArrowType`.
