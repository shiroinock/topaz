# 0483 - initializer expression-await lowering

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.16

## Context

ADR [0482](./0482-terminal-return-expression-await-lowering.md) moved async
frames to ordered suspension steps and accepted a single simple `await` inside
a final return expression. The next arbitrary-await slice should reuse that
ordered model instead of creating another return-only path, while still avoiding
full expression decomposition and general lexical local capture.

## Decision

Accept exactly one `await` inside a top-level `const` / `let` initializer in
block-bodied async functions, async arrows, async methods, and anonymous async
function expressions when the initializer uses the same simple replacement
envelope as terminal return expression await. The awaited payload is stored in
a frame temporary, the matched `await` expression is rewritten to that temporary
for type checking and emission, and the declared binding is stored in the async
frame after resumption so later statements and later suspension steps can read
it. Rejected alternatives: decomposing all expression evaluation order would be
too broad for this phase, treating initializer await as a scheduler/runtime
feature would duplicate the existing `topaz_promise_then_into` ABI, and
capturing all ordinary locals across awaits would cross the general local
capture boundary.

## Implementation

- `src/codegen.ts:146` adds `AwaitInitializerInfo` beside binding and return
  suspension steps.
- `src/codegen.ts:4414` extends async frame discovery so declaration
  initializers with one supported nested await become ordered suspension steps,
  while multiple awaits and unsupported expression shapes stay on the deferred
  diagnostic.
- `src/codegen.ts:4673` renames the simple await-replacement predicate so
  return expressions and declaration initializers share the same accepted
  paren / non-null / prefix / typeof / binary envelope.
- `src/codegen.ts:4782` stores initializer awaited payload temporaries and the
  declared binding in the generated frame, then emits the rewritten initializer
  after resumption before running the suffix segment.
- `MEMO.md:397` records phase 5.16 and keeps richer arbitrary await, general
  local capture, PromiseLike / thenable assimilation, and scheduler modes
  deferred.

## Consequences

- **Accepted**: `examples/async_await_initializer_expression.ts` covers async
  function declarations, async arrows, async methods, anonymous async function
  expressions, direct await bindings before initializer awaits, `const` and
  `let` initializer expression awaits, and later reads of frame-backed declared
  variables.
- **Preserved**: direct top-level `const x = await promise` / `let x = await
  promise`, terminal return await, and terminal return expression await continue
  through the same frame-owned output Promise and `topaz_promise_then_into`
  path.
- **Rejected**: `examples/await_initializer_multiple_deferred_fail.ts` pins
  multiple awaits in one initializer, `examples/await_return_expr_deferred_fail.ts`
  pins call-argument await, and
  `examples/await_expression_statement_deferred_fail.ts` pins non-declaration
  expression-statement await as deferred.
- **Regression**: `tests/smoke.sh:2948` adds the positive initializer
  expression-await case and adjacent fail cases; the smoke suite now has 431
  explicit run entries. The positive sample is also checked with
  `pnpm exec tsc --noEmit --skipLibCheck
  examples/async_await_initializer_expression.ts`.
- **Scope out**: await in call arguments, object / array literals,
  conditional/logical/assignment/property/index expressions, nested or
  control-flow awaits, try/catch/finally awaits, ordinary locals crossing later
  awaits, Promise rejection handlers, PromiseLike / thenable assimilation, and
  scheduler modes remain future work.
