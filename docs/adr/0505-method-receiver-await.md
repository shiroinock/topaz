# 0505 - Method Receiver Await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.38

## Context

ADR [0504](./0504-string-index-of-await-return.md) kept receiver-side await
deferred while adding the last missing `String.indexOf` descriptor surface.
The next async compatibility blocker is not a new method surface, but the
shape `return (await Promise.resolve("abc")).indexOf("b");`: the awaited value
is the method receiver, and the resumed call should still use the same
descriptor-backed validation / emission path as ordinary method calls.

## Decision

Accept exactly non-optional method calls shaped as `(await promise).method(...)`
when they appear in the async frame positions already supported by earlier
phases: declaration initializer, terminal return, and expression-statement
discard. Lowering replaces only the callee receiver with the awaited temp
identifier and resolves the transformed call through
`resolveOrdinaryCallPlan(...)`, so string / number / Array / Map / Set / class /
interface method metadata still owns arity, parameter types, return types, and
unsupported-method diagnostics. Rejected alternatives: a general expression
decomposition pass would widen scope to nested values and property reads; a
bespoke string/class/interface branch would duplicate ordinary descriptors; and
pre-evaluating call arguments before suspension would violate JavaScript
receiver-before-argument evaluation order for this accepted subset.

## Implementation

- `src/codegen.ts:4690`, `src/codegen.ts:4801`, and `src/codegen.ts:4861`
  try receiver-await method lowering before falling back to call-argument await
  in declaration initializers, expression statements, and terminal returns.
- `src/codegen.ts:5006` adds `tryBuildCallReceiverAwaitExpression(...)`, which
  requires a root method call, rejects optional/spread/argument-await shapes,
  rewrites the receiver to the awaited temp identifier, and resolves the
  transformed call through the ordinary call descriptor path.
- The async frame representation is unchanged: receiver-await calls have no
  pre-await receiver or argument temps, so call arguments are emitted only from
  the continuation after the receiver promise has fulfilled.
- `MEMO.md:431` records phase 5.38 in the async compatibility track.

## Consequences

- **Accepted**: `(await p).method(args...)` works in declaration initializer,
  terminal return, and expression-statement discard positions for supported
  descriptor-backed receiver methods.
- **Preserved**: statements before the receiver await run synchronously, the
  receiver promise is awaited, and call arguments are evaluated only after the
  continuation resumes.
- **Rejected**: optional calls/chains, spread arguments, awaited arguments in
  the same call, element-access receiver calls, property reads like
  `(await p).length`, nested expression decomposition, control-flow await,
  top-level await, Promise rejection handlers, thenable assimilation, and
  scheduler/task-queue changes remain out of scope.
- **Regression**: `examples/async_await_method_receiver.ts` covers string
  receiver await in terminal return, class and interface receivers, declaration
  initializer and expression-statement positions, and pre/post ordering.
- **Regression**: `examples/await_return_expr_deferred_fail.ts` now pins the
  still-deferred receiver-await plus awaited-argument shape.
- **Regression count**: the smoke suite now has 462 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
