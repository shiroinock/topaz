# 0561 - Array callback method call descriptor await

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.94

## Context

ADR [0500](./0500-array-method-call-descriptor-await.md) brought callback-less
`Array.includes` / `slice` / `join` calls onto the descriptor-backed
call-argument await frontier, and ADR [0501](./0501-array-push-call-descriptor-await.md)
added `push` for void statement use. `Array.map` and `Array.filter` stayed
deferred even though the synchronous emitter already owns their callback ABI,
map result restrictions, and strict boolean filter predicate checks.

## Decision

Treat `Array.map` and `Array.filter` as ordinary Array method descriptors when the awaited argument is the direct callback value. `Array.map` reuses `inferArrayMapCallbackFn(...)`, rejects `void`, `undefined`, and `T | undefined` callback returns, records the destination Array monomorph, and returns `Array<U>`. `Array.filter` reuses `inferCallbackFn(...)`, requires a strict `boolean` return, and returns the original Array type. Emission still delegates to `emitArrayMethodCall(...)`, so the resumed call runs the existing synchronous map/filter loops after the callback value has been awaited.

Rejected alternatives: adding an async-only map/filter lowering would duplicate callback typing; broadening to `reduce` / `find` / `some` would require new synchronous descriptor contracts; accepting async callbacks would change this slice into JavaScript async mapping semantics; accepting receiver-plus-argument awaits, optional calls, or spread calls would cross the current boundary.

## Implementation

- `src/codegen.ts:13605` extends `resolveArrayMethodCallPlan(...)` with descriptor metadata for `Array.map` callbacks and `Array.filter` predicates.
- `src/codegen.ts:14268` lets awaited call-argument decomposition request the `map` / `filter` Array method descriptors.
- `examples/async_await_array_callback_method_call_arg.ts:1` covers map and filter callback values awaited before synchronous Array loops, including initializer, terminal return, and discard statement forms.
- `examples/await_call_arg_method_deferred_fail.ts:1` now pins the receiver await plus argument await boundary on the standard deferred diagnostic.
- `MEMO.md:487` records the phase 5.94 roadmap item.

## Consequences

- **Accepted**: `xs.map(await Promise.resolve(fn))` and `xs.filter(await Promise.resolve(pred))` compile as "await callback value, then synchronously run the Array method".
- **Preserved**: map callback arity, parameter checks, `void` / `undefined` / `T | undefined` result rejection, and filter strict-boolean predicate rejection keep the existing diagnostics.
- **Deferred**: receiver-side await combined with argument await, multiple awaited arguments, optional/spread calls, async callback mapping, `reduce` / `find` / `some`, PromiseLike / thenable assimilation, and scheduler changes remain outside this phase.
- **Regression**: `async_await_array_callback_method_call_arg` covers the positive surface and `await_call_arg_method_deferred_fail` keeps the deferred boundary.
- **Regression count**: smoke covers 617 explicit `run_case` / `run_module_case` / `run_fail_case` entries, plus the existing static ADR/MEMO contract.
