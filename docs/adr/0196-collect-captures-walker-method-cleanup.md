# 0196. collectCaptures walker method cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0195](./0195-expression-bodied-arrow-return-inference.md) moved the full graph
self-host probe to `src/codegen.ts:4535:31`, where `collectCaptures` used local
`walkStmt` / `walkExpr` arrow visitors that mutually referenced each other.
Topaz closures intentionally capture by value, so supporting JS-style local
recursive or mutually recursive closures would require a different environment
model. [0097](./0097-preallocate-recursive-anons-visit-method.md) already chose
private method extraction for compiler-internal recursive visitors.

## Decision

Move the capture-analysis traversal into private `Emitter` methods while
keeping `collectCaptures` as setup for the local set and callbacks. Nested arrow
capture bubbling is also handled by private helper methods, so recursion goes
through `this.collectCapturesWalkStmt`, `this.collectCapturesWalkExpr`, and
`this.collectCapturesWalkNestedArrow`.

Rejected alternatives: implementing mutable closure cells for local recursion is
language feature work and unnecessary for this compiler-source cleanup; deleting
visitor cases or skipping nested arrow bubbling would weaken capture analysis;
adding examples would not expose new user-visible behavior.

## Implementation

- `src/codegen.ts:4518` keeps `collectCaptures` focused on setup and dispatch.
- `src/codegen.ts:4545` adds `collectCapturesWalkStmt` for the statement cases,
  including declarations, destructuring, `for-of`, switch cases, and catch
  bindings.
- `src/codegen.ts:4645` adds `collectCapturesWalkExpr` for expression cases,
  preserving identifier reads, object shorthand reads, and nested arrow
  boundaries.
- `src/codegen.ts:4740` adds nested arrow bubbling helpers that collect inner
  free identifiers through `scope.lookupAcrossBarrier` and promote only names
  not local to the outer arrow.

## Consequences

- **Accepted**: capture behavior is unchanged for ordinary identifiers,
  shorthand object properties, nested arrows, destructuring locals, `for-of`
  locals, and catch bindings.
- **Rejected**: local recursive and mutually recursive closures remain
  unsupported language features.
- **Regression**: no new example was added because this is compiler-source
  cleanup; `pnpm test` keeps the smoke suite at 288 checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4535:31` `walkExpr` blocker and now
  stops at `src/codegen.ts:4787:10`, where `resolveGenericCall` still uses
  truthy optional lookup handling for `genericFunctions.get(...)`.
