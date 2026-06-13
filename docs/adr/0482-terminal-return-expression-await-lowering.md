# 0482 - terminal return expression-await lowering

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.15

## Context

ADR [0327](./0327-fiber-async-await-design.md) selected Topaz-owned Promise
and async frame semantics, ADR [0473](./0473-async-frame-await-lowering.md)
made generated frames the durable continuation architecture, and ADR
[0481](./0481-terminal-return-await-lowering.md) added final top-level
`return await promise;`. The remaining gap on that path was a final return
expression whose value depends on one awaited payload, while broader arbitrary
await placement still needs more local-capture and cleanup-dispatch work.

## Decision

Represent async frame suspension points as ordered steps rather than separate
binding metadata plus a terminal-return special case. Accept exactly one
`await` under a final top-level `return` expression when the path from `return`
to `await` is a simple expression envelope supported by the current emitter;
after resumption, store the fulfilled payload in a frame-owned temporary and
emit the rewritten return expression through the ordinary expected-type return
path. Rejected alternatives: direct text substitution for only
`return (await p) + 1` would be throwaway architecture, accepting call-argument
or multiple-await expressions would cross the arbitrary-await boundary, and
changing scheduler/runtime ABI would duplicate the existing frame-owned output
Promise path.

## Implementation

- `src/codegen.ts:146` introduces ordered `AsyncSuspensionStep` records for
  await bindings and terminal return-expression awaits.
- `src/codegen.ts:4400` discovers supported await bindings and final return
  expression awaits in one pass, checks the awaited operand as `Promise<T>`,
  substitutes the single await with an internal temporary for type inference,
  and keeps unsupported placements on the deferred diagnostic.
- `src/codegen.ts:4592` limits this phase's nested return await placement to a
  simple paren/unary/binary envelope, keeping call arguments, ternaries,
  non-terminal expressions, and control-flow placements deferred.
- `src/codegen.ts:4638` schedules the first ordered step without caring whether
  it is a binding or terminal return expression await.
- `src/codegen.ts:4701` emits the shared runner so each resumed step stores the
  fulfilled payload in the frame, restores params / prior await bindings, and
  fulfills the frame-owned output Promise after evaluating the final return
  expression.
- `MEMO.md:396` records phase 5.15 and leaves arbitrary await, local capture,
  PromiseLike / thenable assimilation, and scheduler modes deferred.

## Consequences

- **Accepted**: `examples/async_return_await_expression.ts` covers async
  function declarations, async arrows, async methods, anonymous async function
  expressions, and a prior await binding feeding the final return expression.
- **Preserved**: `examples/async_return_await_terminal.ts` and existing await
  binding samples continue to use the same frame-owned output Promise and
  `topaz_promise_then_into` path.
- **Rejected**: fail samples now pin multiple awaits in one return expression,
  non-terminal expression await, call-argument await, nested/control-flow
  await, and try/catch/finally await as deferred.
- **Regression**: `tests/smoke.sh:2947` adds the positive case with FIFO order
  `declared`, `method`, `expr`, then the arrow's second suspension result; the
  smoke suite now has 428 explicit run entries. The positive sample is also
  checked with `pnpm exec tsc --noEmit --skipLibCheck
  examples/async_return_await_expression.ts`.
- **Scope out**: multiple awaits per expression, await in call arguments or
  non-terminal initializers/statements, nested/control-flow await, try/catch/
  finally await, ordinary local capture across later awaits, Promise rejection
  handlers, PromiseLike / thenable assimilation, and scheduler modes remain
  future work.
