# 0472 - basic await binding lowering

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.5

## Context

ADR [0327](./0327-fiber-async-await-design.md) selected Topaz-owned
Promise and async/await lowering with cooperative scheduling. ADRs
[0468](./0468-promise-type-frontier.md),
[0469](./0469-promise-resolve-reject-value-surface.md),
[0470](./0470-promise-then-fulfillment-continuations.md), and
[0471](./0471-async-function-no-await-lowering.md) then landed Promise types,
value allocation, FIFO `.then` continuations, and async functions whose bodies
contain no `await`. The next compatibility gap was accepting one real
suspension point without faking synchronous Promise unwrapping.

## Decision

Accept exactly one top-level await binding inside a top-level async function
declaration: `const x = await promiseExpr;` or `let x = await promiseExpr;`.
The awaited operand must infer as `Promise<T>`, and the bound variable gets
payload type `T`. Lower the function to run prefix statements and the awaited
operand under the existing async throw-to-rejected-Promise frame, then return
the target Promise created by `topaz_promise_then`. The generated continuation
runner reads the fulfilled payload, binds the source variable, runs suffix
statements under its own try frame, and fulfills or rejects the target Promise.
Rejected alternatives: synchronous Promise unboxing, arbitrary await
expressions, multiple suspension points, and await across try/catch/finally
cleanup dispatch remain deferred until a fuller async frame is designed.

## Implementation

- `src/ast.ts:150`, `src/convert_from_tsc.ts:959`,
  `src/lexer.ts:147`, and `src/topaz_parser.ts:1237` add and preserve an
  `await_expr` node through both parser paths.
- `src/codegen.ts:4294` finds the one supported top-level await binding,
  rejects more than one await, non-Promise operands, pre-await local captures,
  and deferred expression placements with anchored `CodegenError`s.
- `src/codegen.ts:4391` lowers the async function prefix and awaited Promise
  expression, allocates the continuation context, captures parameters, pops the
  async try frame, and returns `topaz_promise_then`.
- `src/codegen.ts:4431` emits the typed continuation runner and context struct;
  the runner reads `topaz_promise_fulfilled_payload(source)`, declares the
  awaited binding, emits suffix statements, and fulfills/rejects the target.
- `src/codegen.ts:1348` / `src/codegen.ts:6328` add a continuation-target mode
  so `return` inside the generated runner fulfills the target Promise instead
  of returning a nested Promise value.
- `src/codegen.ts:4724`, `src/codegen.ts:8892`,
  `src/codegen.ts:12524`, and `src/codegen.ts:13459` keep unsupported await
  placements explicit outside the narrow lowering path.

## Consequences

- **Accepted**: `async_await_basic` demonstrates prefix execution before
  `await`, synchronous caller tail ordering, suffix execution in the microtask
  turn, and final `.then` callback ordering. The same sample is valid under
  `pnpm exec tsc --noEmit --skipLibCheck`.
- **Rejected**: `await_expression_deferred_fail`,
  `await_non_promise_fail`, `await_multiple_deferred_fail`,
  `await_return_expr_deferred_fail`, and `await_try_deferred_fail` pin the
  deferred boundaries for top-level/non-async await, non-Promise operands,
  multiple awaits, arbitrary expression placement, and cleanup-dispatch
  crossings.
- **Regression**: smoke now contains 423 explicit `run_*` entries, including
  the new positive await sample and the five new fail boundaries above.
- **Scope out**: no top-level await, async arrow/method/generator lowering,
  multi-suspension pc/state machine, await inside nested blocks, thenable
  assimilation, rejection handler surface, public scheduler API, unhandled
  rejection reporting, timers, I/O event-loop integration, or parallel
  scheduler semantics is implemented here.
