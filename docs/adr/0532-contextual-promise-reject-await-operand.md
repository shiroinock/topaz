# 0532 - Contextual Promise.reject await operand

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.65

## Context

ADR [0531](./0531-promise-reject-call-descriptor-await.md) connected
`Promise.reject(await errorPromise)` to descriptor-backed call-argument await
lowering when the surrounding call site already had a contextual `Promise<T>`
target. The sibling direct operand form, `await Promise.reject(error)`, still
failed because await operand analysis inferred `Promise.reject(...)` without
supplying the awaited payload expectation from an annotated binding or terminal
async return.

## Decision

Teach direct await operand typing to synthesize `Promise<ExpectedPayload>` only
when an async-frame discovery site already knows the awaited payload type.
Annotated direct await bindings use their explicit annotation as the payload,
and terminal direct `return await` uses the async function / arrow / method /
function-expression payload type. The contextual reject check and emitter stay
shared with the existing `Promise.reject(...)` implementation.

Rejected alternatives: inferring `Promise<never>` would add bottom inference
that Topaz does not currently have; accepting unannotated await bindings would
hide the required contextual target; treating expression-statement await as
`Promise<void>` would invent a context not proven by the current machinery;
expanding PromiseLike / thenable assimilation or scheduler semantics would widen
the async compatibility surface beyond this phase.

## Implementation

- `src/codegen.ts:4948` extracts annotated direct await binding payloads before
  operand inference and passes them into contextual await operand typing.
- `src/codegen.ts:5180` passes the async payload only for direct terminal
  `return await` operands, leaving non-direct return-expression awaits on the
  ordinary inference path.
- `src/codegen.ts:12429` adds
  `inferAwaitOperandTypeWithExpectedPayload(...)`, which detects direct
  `Promise.reject(...)`, validates it as `Promise<ExpectedPayload>`, and falls
  back to ordinary inference for every other operand shape.
- `MEMO.md:458` records the 5.65 roadmap completion line.

## Consequences

- **Accepted**: `const n: number = await Promise.reject(new Err("x"))` and
  terminal `return await Promise.reject(new Err("x"))` now type and emit through
  the existing contextual rejected-Promise allocation.
- **Preserved**: unannotated `const n = await Promise.reject(...)`,
  expression-statement await, non-class rejection values, wrong arity, explicit
  type arguments, bottom Promise inference, PromiseLike / thenable assimilation,
  and scheduler changes remain deferred.
- **Regression**: `examples/async_await_promise_reject_operand.ts` covers an
  annotated binding, async declaration return, async arrow return, async method
  return, outer rejection observation, and FIFO ordering around `sync tail`.
- **Regression**: `examples/await_promise_reject_no_context_fail.ts` pins the
  no-context direct await binding diagnostic.
- **Regression count**: the smoke suite now has 552 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
