# 0226. declareVar initialized result cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0225](./0225-object-destructuring-registry-optional-cleanup.md) moved the
full-graph self-host probe to `src/codegen.ts:6098:5`, where `declareVar`
declared `let varType: TopazType` and `let initExpr: string` without
initializers before assigning them in annotated and inferred branches.

Topaz requires initialized locals in compiler source. The existing declaration
semantics, diagnostics, discriminated-union const initializer narrowing, and
generated C were already covered by variable declaration, module const/global,
dunion narrowing, Map/Set fail, and smoke coverage, so this phase only
normalizes the compiler-source shape.

## Decision

Refactor `declareVar` so each annotated or inferred path computes initialized
`const` values and returns after declaring the binding. The annotated path keeps
`typeFromAnnotation`, `assertNotVoid`, `emitWithExpected`, and the existing
dunion narrowing early return; the inferred path keeps the bare `new Map/Set`
type-argument diagnostic and the same array/new/expression emit choices.

Rejected alternatives: broadening the language to accept uninitialized locals
was rejected as a separate feature; changing variable inference or annotation
semantics was rejected as behavioral scope; touching `emitForStatement`,
for-of lowering, or unrelated expression inference was rejected because this
phase is only a self-host source cleanup.

## Implementation

- `src/codegen.ts:6098-6136` removes the uninitialized annotated-result locals,
  computes `varType` / `initExpr` as initialized `const` values, and preserves
  the annotated declaration return path.
- `src/codegen.ts:6124-6133` keeps const-only dunion initializer narrowing but
  replaces `classNameOf(initType)!` with an explicit `classNameMaybe !==
  undefined` guard before checking the declared variants.
- `src/codegen.ts:6137-6163` computes inferred `varType` and per-emit
  `initExpr` locals in each branch, then declares and returns immediately.

## Consequences

- **Accepted**: successful variable declarations keep the same C output shape.
- **Rejected**: missing initializers and unannotated bare `new Map()` /
  `new Set()` keep their existing diagnostics.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by existing variable declaration, module const/global, dunion
  narrowing, Map/Set fail, and full smoke coverage. `pnpm test` passes with the
  existing case set.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:6098:5` uninitialized local blocker and
  now stops at `src/codegen.ts:6141:10`: the bare `new Map/Set` check accesses
  `init.callee.name` before narrowing the `init.callee` union.
