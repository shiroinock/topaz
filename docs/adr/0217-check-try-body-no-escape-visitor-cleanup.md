# 0217. checkTryBodyNoEscape visitor cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0216](./0216-emit-try-statement-subset-cleanup.md) moved the full-graph
self-host probe to `src/codegen.ts:5614:56`, where `checkTryBodyNoEscape`
still used recursive local arrow visitors (`walkExpr` / `walk`). Topaz does
not support that compiler-source pattern yet, and this visitor also carried
truthy optional checks in its statement traversal.

[0029](./0029-codegen-topaz-ast-6e2-expr-stmt.md) established this as the
Topaz AST traversal for try-body escape checks, and [0014](./0014-try-body-return.md)
keeps `return` through try bodies accepted while preserving the conservative
`break` / `continue` rejection.

## Decision

Move the try-body escape traversal into private `Emitter` methods and leave
`checkTryBodyNoEscape` as a block-statement dispatcher. Normalize optional
children in this visitor cluster to explicit `undefined` comparisons and use
minimal diagnostic anchors for the `break` / `continue` errors.

Rejected alternatives: adding recursive local-function or recursive-arrow
support was rejected because this is compiler-source cleanup, not a closure
semantics step. Relaxing the try-body `break` / `continue` rule was rejected
because it would require new lowering around `topaz_try_pop()`. Sweeping
unrelated optional checks was rejected as outside this phase's ownership.

## Implementation

- `src/codegen.ts:5598-5600` reduces `checkTryBodyNoEscape` to a loop over the
  try block statements and dispatches through `checkTryBodyNoEscapeStmt`.
- `src/codegen.ts:5606-5689` adds the statement visitor, preserving traversal
  through blocks, branches, loops, switch cases, nested try/catch/finally
  blocks, returns, and throws.
- `src/codegen.ts:5608-5617` keeps `break` / `continue` rejected with the same
  messages while passing `{ pos: s.pos }` instead of full statement nodes.
- `src/codegen.ts:5621-5682` replaces the visitor's optional child truthiness
  checks with explicit locals and `!== undefined` comparisons.
- `src/codegen.ts:5692-5768` adds the expression visitor and preserves
  `arrow_expr` as the function-boundary traversal barrier.

## Consequences

- **Accepted**: try/catch language semantics and generated C for successful
  programs are unchanged.
- **Accepted**: try-body `return` remains allowed via `liveTryFrames`.
- **Rejected**: `break` / `continue` inside any traversed try body remain
  unsupported, including the conservative nested-loop cases.
- **Rejected**: `finally` lowering and recursive local visitor support remain
  out of scope.
- **Regression**: no new example was added because this is compiler-source
  cleanup; existing try/catch, try-return, try-break-fail, and the smoke suite
  still pass.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5614:56` `walkExpr` blocker and now
  stops at `src/codegen.ts:5778:11`: `type mismatch: expected topaz_boolean,
  got topaz_union_class_anon_124_or_undefined`.
