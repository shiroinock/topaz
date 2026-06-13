# 0488 - Map / Set call descriptor await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.21

## Context

ADR [0487](./0487-call-lowering-descriptor-frontier.md) introduced the call
plan used by normal ordinary calls and by the 5.17-5.19 call-argument `await`
decomposition. Collection methods were still outside that plan, so accepting
`m.has(await p)` or `s.delete(await p)` would otherwise require a separate
async-only adapter beside the normal Map / Set emitter.

## Decision

Extend the call plan with Map / Set method variants that carry receiver,
receiver type, method name, parameter list, return type, diagnostic label, and
the key / value / element metadata needed by normal collection lowering. Map /
Set are the first specialized descriptor extension because their supported
methods have fixed arity, explicit key/value or element metadata, a reference
receiver that can be stored in an async frame temp, and no callback, default
argument, or scheduler semantics. Rejected alternatives: adding Array methods
now would mix callback and spread/default-frontier concerns into this phase;
adding String / Number would not exercise reference receiver temps; adding
Promise or synthetic namespaces would cross scheduler and non-value namespace
boundaries.

## Implementation

- `src/codegen.ts:182` adds descriptor variants for Map and Set method calls,
  including receiver metadata, parameter metadata, and collection element
  metadata.
- `src/codegen.ts:4884` stores Map / Set receivers in the async frame before
  suspension, matching class / interface method call-argument await ordering.
- `src/codegen.ts:11299` resolves Map / Set method plans for `set/get/has/delete`
  and `add/has/delete`, plus existing standalone `values/keys` iterator calls.
- `src/codegen.ts:11592` emits Map / Set calls from the descriptor while
  preserving the existing runtime entrypoints and arity diagnostics.
- `src/codegen.ts:13446` routes normal Map / Set method emit through the
  descriptor-backed emitter, and `src/codegen.ts:14395` uses the same plan
  return type for value-position inference.
- `MEMO.md:402` records the 5.21 boundary and deferrals.

## Consequences

- **Accepted**: block-bodied async function declarations, async arrows, async
  methods, and anonymous async function expressions can use one direct
  call-argument `await` in declaration initializers and terminal returns for
  value-returning Map / Set methods.
- **Rejected**: `Map.set(...)` and `Set.add(...)` still return void in this
  dialect and remain invalid as values, including when one direct argument is
  awaited.
- **Regression**: `examples/async_await_map_set_call_arg.ts` covers Map.get,
  Map.has, Set.has, terminal Map.has, terminal Set.delete, receiver side
  effects before `sync tail`, and post-resumption `.then` results.
  `examples/await_call_arg_collection_void_deferred_fail.ts` pins the void
  mutator boundary; `tests/smoke.sh:2953` and `tests/smoke.sh:2962` add both
  rows. The smoke suite now has 437 explicit run entries.
- **Scope outside**: Array, String / Number, Promise static and method calls,
  synthetic namespaces (`console`, `process`, `String`, `node:*`, internal
  helpers), optional calls, element access callees, constructors, nested or
  multiple awaits, expression-statement await, general expression
  decomposition, and local capture across await remain deferred.
