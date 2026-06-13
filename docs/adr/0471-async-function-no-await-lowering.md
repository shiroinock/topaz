# 0471 - async function no-await lowering

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.4

## Context

ADR [0327](./0327-fiber-async-await-design.md) selected Topaz-owned
`Promise<T>` and async/await lowering, and ADRs
[0468](./0468-promise-type-frontier.md),
[0469](./0469-promise-resolve-reject-value-surface.md), and
[0470](./0470-promise-then-fulfillment-continuations.md) built the Promise
type, value, and FIFO continuation substrate. The remaining compatibility gap
was that a TS-compatible `async function` declaration still failed before the
compiler could use the existing fulfilled/rejected Promise surface.

## Decision

Accept only top-level `async function` declarations whose body contains no
`await`. The source return annotation must resolve to `Promise<T>`, while
body `return expr` is checked against payload `T` and lowered to a fulfilled
Topaz Promise; `return;` and fallthrough are accepted only for `Promise<void>`.
Escaping Topaz class-instance throws are caught at the async function boundary
and returned as rejected Promises. Rejected alternatives: implementing `await`
without a suspension ABI, accepting async generic functions, async arrows,
async methods, async generators, public scheduler APIs, rejection handlers,
and JS thenable assimilation all remain separate surfaces.

## Implementation

- `src/ast.ts:537`, `src/convert_from_tsc.ts:277`, and
  `src/topaz_parser.ts:212` add and preserve `FunctionDecl.isAsync` for both
  parser paths. The converter still rejects async arrows/methods through the
  existing async diagnostic.
- `src/lexer.ts:143` recognizes `async` so the self-host parser can parse
  `async function` and `export async function` module items.
- `src/codegen.ts:2397` rejects async generic functions and requires async
  function return annotations to be `Promise<T>`.
- `src/codegen.ts:4195` emits async function definitions with the normal
  opaque Promise C ABI while checking body returns against the payload type.
- `src/codegen.ts:4230` wraps the synchronous body in a function-level
  `topaz_try_frame`; normal returns call `topaz_promise_resolve_copy` /
  `topaz_promise_resolve_void`, and escaping throws call
  `topaz_promise_reject`.
- `src/codegen.ts:5840` teaches return-statement lowering how to resolve async
  payload returns while preserving existing try-frame popping.

## Consequences

- **Accepted**: `async_function_no_await` demonstrates synchronous async body
  execution, rejected Promise creation from a thrown class instance, and
  deferred `.then` FIFO callbacks on already-fulfilled Promises.
- **Rejected**: `async_function_deferred_fail` keeps `await` at
  `unsupported expression AwaitExpression`; `async_function_wrong_return_fail`
  requires `Promise<T>` annotations; `async_function_return_promise_fail`
  rejects accidental thenable flattening; `async_arrow_deferred_fail`,
  `async_method_deferred_fail`, and `async_generic_deferred_fail` keep the
  deferred async surfaces explicit.
- **Regression**: smoke now contains 417 explicit `run_*` entries, including the new
  positive async sample and the six async fail boundaries above. The positive
  sample is also checked with
  `pnpm exec tsc --noEmit --skipLibCheck examples/async_function_no_await.ts`.
- **Scope out**: no `await` lowering, fiber/state-machine frame ABI, async
  arrow/method/generator lowering, `for await`, rejection handler surface,
  unhandled rejection reporting, scheduler API, `PromiseLike` bridge, static
  thenable assimilation, or parallel scheduler semantics is implemented here.
