# 0570 - Awaited receiver method arguments

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.103

## Context

ADR [0505](./0505-method-receiver-await.md) accepted direct awaited receivers
for ordinary method calls when all arguments were synchronous. ADR
[0569](./0569-multi-await-method-call-arguments.md) accepted multiple direct
awaited arguments for class/interface methods when the receiver was already
available before the first suspension. The remaining gap was their intersection:
`(await boxPromise()).method(await left, await right)` should use the same
ordered suspension machinery instead of a separate receiver-specialized path.

## Decision

Accept non-optional ordinary class and interface method calls whose callee
receiver is a direct parenthesized `await` and whose argument list contains at
least one direct awaited argument. The ordered plan now treats the receiver
await as the first suspension step, rewrites the signature and final callee to a
receiver payload temp, schedules direct awaited arguments left-to-right, and
emits the class/interface method dispatch exactly once after the final awaited
argument resumes.

Rejected alternatives: teaching the receiver-only single-await path about
argument awaits would fork the ordered plan; allowing scalar, collection,
Promise, synthetic, or builtin descriptors would cross descriptor-specific
return and ABI policy; nested awaited argument expressions, optional/spread
calls, constructor/element calls, and general expression decomposition remain
too broad for this phase.

## Implementation

- `src/codegen.ts:5352`, `src/codegen.ts:5514`, and `src/codegen.ts:5602` keep
  routing multi-await initializer, expression-statement, and terminal-return
  positions through the shared ordered call-argument planner.
- `src/codegen.ts:6307` detects a direct awaited property-call receiver,
  resolves its `Promise<T>` operand, creates a receiver payload temp, and
  rewrites the signature callee to read that temp.
- `src/codegen.ts:6360` preserves the old two-awaited-argument threshold when
  there is no receiver await, while requiring at least one direct awaited
  argument when the receiver itself is awaited.
- `src/codegen.ts:6407` keeps the new receiver-await intersection limited to
  ordinary class/interface method plans; specialized descriptor calls still
  fall back to the shared deferred await diagnostic.
- `src/codegen.ts:6424` and `src/codegen.ts:6482` avoid adding a second
  receiver snapshot for awaited receivers and attach pre-argument temps to the
  argument step after the receiver step.

## Consequences

- **Accepted**: `(await boxPromise()).combine(pre(), await value, post())`,
  `(await ifacePromise()).consume(await value)`, and terminal returns with two
  direct awaited method arguments in the existing async-frame positions.
- **Preserved**: receiver-only method awaits, non-awaited-receiver multi-await
  method arguments, FIFO continuation order, and all runtime scheduler code.
- **Rejected**: `(await textPromise()).indexOf(await needle)`, Array / Map /
  Set / Promise / synthetic descriptor calls, nested awaited argument
  expressions, optional/spread calls, constructor/element calls, PromiseLike /
  thenable expansion, and general expression decomposition.
- **Regression**: `async_await_method_receiver_arg` covers class and interface
  method initializers, terminal return with two awaited arguments, discard
  statements, async arrow, async method, anonymous async function expression,
  and observable receiver/pre-argument/final-call order. The retargeted
  `await_call_arg_multiple_deferred_fail` now pins nested awaited method
  arguments under an awaited receiver.
- **Regression count**: smoke now covers 636 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
