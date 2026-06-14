# 0613 - Array callback nested awaited callback expression

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.146

## Context

[0561](./0561-array-callback-method-call-descriptor-await.md) accepted direct
awaited callback values for synchronous `Array.map` and `Array.filter`
receivers, and [0571](./0571-awaited-array-receiver-callback-arguments.md)
accepted the same callback-family descriptors when the Array receiver itself is
awaited. Later nested-call phases, including [0600](./0600-recursive-nested-call-argument-await-descriptors.md),
made descriptor-backed nested call arguments materialize into result temps, but
the final no-receiver-await root allowlist still rejected `xs.map(factory(await
fn))` when the factory call was itself a descriptor-backed method call with an
awaited receiver.

## Decision

Extend only the no-receiver-await root allowlist in
`tryBuildMultiAwaitCallArgExpression` so `Array.map` and `Array.filter` may
consume a descriptor-backed nested callback expression that has already been
planned and materialized by the nested-call machinery. The nested call remains
owned by `tryBuildNestedMultiAwaitCallArgPlan`: direct awaited nested receivers
and direct awaited nested arguments keep their existing owners, and the ordinary
Array method descriptor still performs callback type checking, filter predicate
checking, result Array monomorph registration, and final synchronous emission.
Rejected alternatives: allowing every `array_method` root would blur non-callback
return/void contracts; an Array-specific async emitter would duplicate callback
descriptor logic; arbitrary callback expressions, optional/spread calls, async
callback semantics, scheduler changes, and thenable changes remain outside this
slice.

## Implementation

- `src/codegen.ts:6834` adds a descriptor-backed nested callback detector that
  accepts only nested method descriptors, not top-level/generic/fn-value roots.
- `src/codegen.ts:7542` lets no-receiver-await root plans accept only
  `array_method` `map` / `filter` when argument 0 came from that nested
  descriptor path.
- `examples/await_call_arg_method_deferred_fail.ts:1` is retargeted into a
  positive map/filter regression that logs receiver await, callback-argument
  await, nested callback materialization, and final Array callback execution.
- `examples/await_call_arg_array_includes_nested_callback_deferred_fail.ts:1`
  keeps a nearby non-callback Array method on the shared deferred diagnostic.
- `tests/smoke.sh:3130` moves the former fail fixture to `run_case` and
  `tests/smoke.sh:3131` adds the new `Array.includes` fail boundary.

## Consequences

- **Accepted**: `Array.map` / `Array.filter` callback arguments shaped like a
  descriptor-backed nested method call whose receiver and argument contain
  awaits.
- **Preserved**: callback arity/type diagnostics, filter boolean predicate
  diagnostics, result Array monomorph registration, and synchronous Array method
  emission remain on the ordinary `array_method` descriptor path.
- **Rejected**: non-`map`/`filter` Array methods, optional/spread calls,
  constructor/element calls, arbitrary callback expression decomposition, async
  callback semantics, PromiseLike/thenable expansion, and runtime scheduler
  changes.
- **Regression**: `await_call_arg_method_deferred_fail` now proves the accepted
  map/filter surface; `await_call_arg_array_includes_nested_callback_deferred_fail`
  pins the closest non-callback Array method frontier.
- **Regression count**: smoke covers 685 `run_case` / `run_module_case` /
  `run_fail_case` entries.
