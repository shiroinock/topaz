# 0614 - Awaited collection receiver nested keys

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.147

## Context

[0573](./0573-awaited-collection-receiver-arguments.md) accepted direct awaited
`Map` / `Set` receivers with direct awaited key/value arguments, but deliberately
left nested collection key/value expressions deferred. [0600](./0600-recursive-nested-call-argument-await-descriptors.md)
and [0601](./0601-awaited-nested-call-receivers.md) later made nested
descriptor-backed call arguments recursive, and [0613](./0613-array-callback-nested-awaited-callback-expression.md)
showed that a root method descriptor can safely consume an already materialized
nested descriptor result temp.

## Decision

Allow the root awaited collection receiver plan to consume descriptor-backed
nested key/value result temps. When a nested property call's receiver is itself a
descriptor-backed child call, materialize that child first and use its result
temp as the parent receiver, then let the ordinary `Map.get` / `Map.has` /
`Map.delete` or `Set.has` / `Set.delete` descriptor perform the final call.
Rejected alternatives: a generic expression-decomposition IR remains too broad,
collection-specific async emitters would duplicate descriptor metadata,
`Map.set` / `Set.add` still return void, and optional/spread calls,
non-descriptor receiver/key expressions, ternary keys, assignment leaves, and
iterator-valued collection methods stay deferred.

## Implementation

- `src/codegen.ts:286` adds a nested-plan marker for a materialized receiver
  child call.
- `src/codegen.ts:6610` keeps receiver expressions narrow: direct awaited
  receivers and descriptor-backed child calls are accepted, broader receiver
  awaits are still rejected.
- `src/codegen.ts:6690` recursively plans a property receiver child call,
  appends its materialization event before the parent key/value argument awaits,
  and rewrites the parent callee to use the child result temp.
- `src/codegen.ts:6964` enables that path only for direct awaited `Map` / `Set`
  receiver roots with value-returning collection methods.
- `src/codegen.ts:7281` skips the old receiver snapshot path when the receiver
  is already a materialized nested descriptor temp.
- `examples/await_collection_receiver_arg_nested_deferred_fail.ts:43` is
  retargeted from fail to positive coverage for an awaited `Map.get` receiver
  plus nested `identity(await box).key(await key)` and a terminal `Set.has`.
- `examples/await_collection_receiver_arg_conditional_deferred_fail.ts:3`
  preserves the next collection key frontier for ternary key awaits.
- `tests/smoke.sh:3133` moves the former fail fixture to `run_case`, and
  `tests/smoke.sh:3134` adds the new deferred collection key fixture.

## Consequences

- **Accepted**: direct awaited `Map` / `Set` receivers whose key/value argument
  is a descriptor-backed nested call tree, including child receiver calls and
  awaited nested arguments.
- **Preserved**: receiver await ordering, nested child materialization, ordinary
  collection arity/type checking, `Map.get` `V | undefined` narrowing, and
  single final collection method emission remain on the shared descriptor path.
- **Rejected**: void collection mutators in value position, Array non-callback
  nested callback roots, ternary key awaits, optional/spread calls, arbitrary
  expression decomposition, PromiseLike/thenable expansion, and runtime
  scheduler changes.
- **Regression**: `await_collection_receiver_arg_nested_deferred_fail` now
  proves the accepted Map/Set surface;
  `await_collection_receiver_arg_conditional_deferred_fail`,
  `await_call_arg_collection_void_deferred_fail`, and
  `await_call_arg_array_includes_nested_callback_deferred_fail` pin nearby
  deferred boundaries.
- **Regression count**: smoke covers 686 `run_case` / `run_module_case` /
  `run_fail_case` entries.
