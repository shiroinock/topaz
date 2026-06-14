# 0573 - Awaited Collection receiver arguments

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.106

## Context

ADR [0488](./0488-map-set-call-descriptor-await.md) moved Map / Set
call-argument await lowering onto ordinary call descriptors for synchronous
receivers. ADR [0570](./0570-awaited-receiver-method-arguments.md), ADR
[0571](./0571-awaited-array-receiver-callback-arguments.md), and ADR
[0572](./0572-awaited-string-receiver-index-of.md) then proved that the ordered
multi-await call plan can schedule a direct awaited receiver before direct
awaited arguments without descriptor-specific async emitters.

## Decision

Accept non-optional value-returning `Map.get`, `Map.has`, `Map.delete`,
`Set.has`, and `Set.delete` calls in supported async-frame positions when the
receiver is a direct parenthesized `await` resolving to `Promise<Map<K, V>>` or
`Promise<Set<T>>` and the key/value argument is a direct awaited expression.
The shared ordered call plan schedules the collection receiver await first,
rewrites the callee to the receiver payload temp, schedules the key/value await
second, and then emits the existing synchronous Map / Set descriptor exactly
once.

Rejected alternatives: adding collection-specific async emitters would
duplicate the descriptor metadata from ADR 0488; accepting `Map.set` / `Set.add`
in value position would change the dialect's void mutator rule; iterator-valued
`keys` / `values` / `entries`, nested awaited key/value expressions,
optional/spread calls, Array/String/Number/Promise descriptors, PromiseLike /
thenable expansion, and scheduler changes remain out of scope.

## Implementation

- `src/codegen.ts:6407` keeps receiver-await multi-await calls on the shared
  ordered planner while adding only value-returning `map_method` and
  `set_method` plans beside the existing class/interface, Array callback, and
  String `indexOf` allowances.
- `src/codegen.ts:6307` and `src/codegen.ts:6360` continue to create the
  receiver payload temp and require at least one direct awaited argument when a
  receiver await is present.
- `src/codegen.ts:14298` and `src/codegen.ts:15130` continue to resolve and
  emit Map / Set calls through the ordinary descriptors, preserving existing
  arity checks, `Map.get` optional return typing, and runtime entrypoints.
- `examples/async_await_collection_receiver_arg.ts` covers initializer,
  terminal return, expression-statement discard, async arrow, async method, and
  anonymous async function expression positions.
- `examples/await_collection_receiver_arg_nested_deferred_fail.ts` pins the
  remaining nested awaited key/value expression boundary.

## Consequences

- **Accepted**: `(await mapPromise()).get(await keyPromise())`,
  `(await mapPromise()).has(await keyPromise())`, `(await mapPromise()).delete(await keyPromise())`,
  `(await setPromise()).has(await valuePromise())`, and
  `(await setPromise()).delete(await valuePromise())` in top-level async-frame
  initializers, discard statements, and terminal returns.
- **Preserved**: synchronous-receiver collection call-argument await,
  `Map.get` returning `V | undefined`, void `Map.set` / `Set.add` value-position
  diagnostics, FIFO continuation order, and runtime scheduler code.
- **Rejected**: collection iterator methods, nested awaited key/value
  expressions such as `(await m).get(wrap(await key))`, multiple awaited
  arguments, optional/spread calls, Array / String / Number / Promise /
  synthetic descriptor receiver awaits, PromiseLike / thenable expansion, and
  scheduler changes.
- **Regression**: `async_await_collection_receiver_arg` proves receiver work
  before `sync tail`, key/value wait after receiver resume, and final collection
  method results after the key/value resumes.
  `await_collection_receiver_arg_nested_deferred_fail` keeps the nested
  key/value boundary.
- **Regression count**: smoke now covers 637 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
