# 0599 - Nested call argument await descriptors

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.132

## Context

[0598](./0598-multiple-binary-call-arguments.md) allowed multiple binary call
arguments while still leaving nested call roots deferred. The shared
`callArgEvents` stream already preserved source order for direct awaited
arguments and binary snapshot leaves, so the next narrow compatibility slice was
`f(g(await x), await y)` without introducing a general recursive expression
planner.

## Decision

Add a one-level nested call argument descriptor inside
`tryBuildMultiAwaitCallArgExpression`. The nested call contributes its inner
await and snapshot events to the outer source-order stream, resolves through
`resolveOrdinaryCallPlan`, and materializes its result into a temp after the
last inner await before the outer call consumes it. Rejected alternatives:
building a general recursive expression planner is still too broad, and
hand-emitting `wrap(await x)` would duplicate ordinary call descriptor
responsibilities for arity, typing, receivers, and final emission.

## Implementation

- `src/codegen.ts:170` adds post-await materialized temps to async frame step
  metadata so a nested call result can be stored after an await resumes.
- `src/codegen.ts:6441` collects one-level nested call argument descriptors and
  inserts their inner awaits, binary snapshots, and materialization events into
  the outer call-argument event stream.
- `src/codegen.ts:6856` resolves each nested call through
  `resolveOrdinaryCallPlan`, adds receiver/pre-argument temps to the relevant
  suspension step, and replaces the outer argument with the nested result temp.
- `src/codegen.ts:8120` and `src/codegen.ts:8516` store and restore post-await
  materialized temps across async continuations.
- `examples/async_call_arg_nested_call_descriptor_await.ts` covers declaration
  initializer, terminal return, and expression-statement discard positions.
- `examples/await_call_arg_recursive_nested_call_deferred_fail.ts` pins the next
  recursive nested call frontier.

## Consequences

- **Accepted**: one-level descriptor-backed nested call arguments whose inner
  arguments are direct/simple awaits or already supported binary snapshot forms.
- **Preserved**: ordinary call descriptor ownership of typing, arity, receiver
  temps, pre-argument temps, and final call emission; source order across later
  outer awaited arguments.
- **Rejected**: recursive nested call roots, awaited nested receivers, nested
  calls inside snapshot leaves, optional/spread calls, constructor/element call
  variants, short-circuit binary trees, and scheduler/runtime changes.
- **Regression**: `async_call_arg_nested_call_descriptor_await` proves the new
  accepted surface; `await_call_arg_recursive_nested_call_deferred_fail` keeps
  the nearest remaining nested-call frontier deferred.
- **Regression count**: smoke covers 677 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
