# 0571 - Awaited Array receiver callback arguments

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.104

## Context

ADR [0561](./0561-array-callback-method-call-descriptor-await.md) accepted
direct awaited callback values for `Array.map` and `Array.filter` when the
Array receiver was already synchronous. ADR
[0570](./0570-awaited-receiver-method-arguments.md) then proved that the
ordered multi-await call plan can put a direct awaited method receiver before
direct awaited method arguments. The next narrow descriptor step is their
intersection for Array callback methods, without adding an Array-specific async
emitter.

## Decision

Accept non-optional `Array.map` and `Array.filter` calls in supported async
frame positions when the receiver is a direct parenthesized `await` resolving
to `Promise<Array<T>>` and the callback argument is a direct awaited expression.
The shared ordered call plan schedules the receiver await first, rewrites the
callee to the receiver payload temp, schedules the callback await second, and
then emits the existing synchronous Array method plan exactly once.

Rejected alternatives: creating a separate Array async emitter would duplicate
callback typing and monomorph registration; broadening to other Array methods
would leave the callback contract behind; accepting nested awaited callback
expressions, optional/spread calls, Map/Set/String/Number/Promise descriptors,
or async callback mapping would cross this phase's fixed boundary.

## Implementation

- `src/codegen.ts:6407` keeps receiver-await multi-await calls on the shared
  ordered planner while adding only `array_method` plans for `map` and `filter`
  beside the existing class/interface allowance.
- `src/codegen.ts:6307` and `src/codegen.ts:6360` already create the receiver
  payload temp and require at least one direct awaited argument when a receiver
  await is present.
- `src/codegen.ts:14155` continues to resolve `Array.map` and `Array.filter`
  through the ordinary Array method descriptor, so callback inference, strict
  boolean predicate checking, result Array monomorphs, and synchronous emit stay
  shared with the no-receiver-await surface.
- `examples/async_await_array_receiver_callback_arg.ts` covers initializer,
  expression-statement discard, terminal return, async arrow, async method, and
  anonymous async function expression positions.
- `examples/await_call_arg_method_deferred_fail.ts` now pins the remaining
  nested awaited callback expression boundary.

## Consequences

- **Accepted**: `(await numbersPromise()).map(await callbackPromise())` and
  `(await numbersPromise()).filter(await predicatePromise())` in top-level
  async-frame initializers, discard statements, and terminal returns.
- **Preserved**: synchronous-receiver `xs.map(await callbackPromise())`,
  ordinary class/interface awaited receiver plus awaited arguments, receiver-only
  method await, FIFO continuation order, and runtime scheduler code.
- **Rejected**: Array methods other than `map` / `filter`, nested awaited
  callback expressions such as `(await xs).map(wrap(await cb))`, multiple
  callback arguments, optional/spread calls, Map/Set/String/Number/Promise and
  synthetic descriptor receiver awaits, PromiseLike / thenable expansion, and
  async callback mapping semantics.
- **Regression**: `async_await_array_receiver_callback_arg` proves receiver
  work before `sync tail`, callback wait after receiver resume, and Array method
  callback execution after the callback value resumes. The retargeted
  `await_call_arg_method_deferred_fail` keeps the nested callback boundary.
- **Regression count**: smoke now covers 634 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
