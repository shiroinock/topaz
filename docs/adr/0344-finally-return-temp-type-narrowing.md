# 0344 - finally return temp type narrowing

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.16

## Context

After [0343](./0343-never-call-carry-narrowing.md), the self-host gate
advanced to `src/codegen.ts:6064:39` inside `emitTryCatchFinally`. The generated
C return temporary name was only created when `this.currentReturnType` was
present and non-void, but the compiler source kept only the optional name as a
separate local. Topaz does not infer that this local's presence also proves the
saved return type is non-undefined.

## Decision

Keep the language subset and try/finally lowering unchanged, and spell the
local construction correlation directly in `emitTryCatchFinally`: create paired
optional locals for the return temporary name and the type used to declare it,
then bind explicit narrowed aliases at the declaration and final return dispatch
sites. Rejected alternatives: adding general correlation analysis between
locals was rejected as broader than the self-host blocker; changing
`FinallyReturnContext` or generated C semantics was rejected because the runtime
cleanup behavior is already covered by existing smoke cases.

## Implementation

- `src/codegen.ts:6019` still snapshots `this.currentReturnType`, then fills
  `returnVarMaybe` and `returnTypeForVarMaybe` together only in the non-void
  return branch.
- `src/codegen.ts:6068` declares the C return temporary only after narrowing the
  name and defensively requiring the paired type before calling `cTypeName`.
- `src/codegen.ts:6086` emits the `reason == 1` return dispatch from a positive
  `currentReturnTypeMaybe !== undefined` block before checking whether the
  narrowed return type is `void`.

## Consequences

- **Accepted**: existing non-void `try/finally` return lowering still declares
  one temporary, stores return values through it, runs `finally`, and returns it.
- **Accepted**: existing void return-through-finally lowering still emits bare
  `return;` after cleanup.
- **Rejected**: arbitrary local correlation/narrowing and new try/finally
  semantics remain out of scope.
- **Regression**: no standalone sample was added; existing
  `try_finally_return`, `try_finally`, `try_catch_finally`, and full smoke
  coverage remain the regression surface. `tests/smoke.sh` currently registers
  342 cases.
- **Current blocker**: `pnpm run test:selfhost` now advances to
  `src/codegen.ts:6311:83`, where `s.elseBranch` is still seen as
  `Stmt | undefined` in the recursive cleanup-label query.
