# 0489 - String / Number call descriptor await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.22

## Context

ADR [0487](./0487-call-lowering-descriptor-frontier.md) introduced the ordinary
call plan, and ADR [0488](./0488-map-set-call-descriptor-await.md) extended it
to Map / Set methods. String / Number methods still used separate normal-call
helpers, so call-argument `await` for `s.slice(await p)` would otherwise need
an async-only mirror of String method arity, optional/default argument, and
return-type rules.

## Decision

Add descriptor variants for scalar String and Number receiver methods. String /
Number are the next specialized descriptor extension after Map / Set because
they have a fixed receiver method surface, exercise scalar receiver temps before
suspension, and do not introduce callback, collection-loop, or scheduler
semantics. Rejected alternatives: Array methods stay deferred because their
supported surface includes callbacks, spread, and element-wise loop bodies;
Promise static/method calls stay deferred because they cross scheduler and
thenable semantics; synthetic namespaces such as `String.fromCharCode`,
`console`, `process`, `node:*`, and internal prelude helpers stay outside this
receiver-descriptor frontier because they are not scalar receiver methods.

## Implementation

- `src/codegen.ts` adds `string_method` and `number_method` ordinary call plans
  that carry receiver expression/type, method name, parameter list, return type,
  and diagnostic label.
- `src/codegen.ts` resolves String / Number methods through the descriptor for
  normal calls and inference while preserving the existing String optional
  `slice(start?, end?)` NaN-sentinel lowering and `Number.toString()` arity
  diagnostic.
- `src/codegen.ts` stores String receivers in async frame temps before
  suspension, stores any arguments to the left of the direct awaited argument,
  and restores the awaited payload through the same descriptor-backed normal
  String emitter after resumption.
- `examples/async_await_string_call_arg.ts` covers declaration-initializer
  String call-argument `await`, terminal-return String call-argument `await`,
  async declarations/arrows/methods/function expressions, receiver ordering,
  pre-await argument ordering, and `.then` results.
- `examples/await_call_arg_string_static_deferred_fail.ts` pins
  `String.fromCharCode(await ...)` as a deferred synthetic namespace case.

## Consequences

- **Accepted**: block-bodied async function declarations, async arrows, async
  methods, and anonymous async function expressions can use one direct
  call-argument `await` in declaration initializers and terminal returns for
  value-returning String receiver methods.
- **Preserved**: normal `String` method calls and `Number.toString()` continue
  to use the existing runtime prelude/C substrate helpers and diagnostics.
- **Regression**: `tests/smoke.sh` adds positive String call-argument await
  coverage and the optional static String fail pin; the smoke suite now has 448
  explicit run entries.
- **Scope outside**: Array, Promise static/method calls, synthetic namespaces,
  optional calls, element access callees, constructors, nested or multiple
  awaits, expression-statement await, general expression decomposition, and
  local capture across await remain deferred.
