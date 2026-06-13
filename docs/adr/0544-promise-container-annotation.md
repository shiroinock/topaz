# 0544 - promise container annotation

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.77

## Context

ADR [0543](./0543-promise-like-container-annotation.md) opened container
annotation storage for `PromiseLike<T>` values. The Topaz-owned `Promise<T>`
type is already a concrete opaque runtime pointer with identity, so TypeScript
migration declarations should be able to store those pointers in arrays, map
values, and sets without implying new Promise scheduling or method semantics.

## Decision

Accept `Array<Promise<T>>`, `Map<K, Promise<T>>` for scalar `K`, and
`Set<Promise<T>>` as storage/type annotations only. `Promise<T>` remains a
Topaz-owned opaque pointer. Arrays store the pointer value directly,
`Map<K, Promise<T>>` uses the same opaque pointer as both value and optional
value type with `NULL` as the missing sentinel, and `Set<Promise<T>>` uses
Promise pointer identity: `topaz_hash_pointer((const void *)p)` and `a == b`.

Rejected alternatives: `Map<Promise<T>, V>` keys stay deferred because they
would publish Promise key hashing/equality semantics; `Promise.all`,
`Promise.race`, other combinators, thenable assimilation, `PromiseLike` bridge
behavior, scheduler/task queue behavior, and new `await` placements remain
outside this type-spelling phase.

## Implementation

- `src/codegen.ts:525` lets `arrayOf` accept `Promise<T>` as an Array element.
- `src/codegen.ts:548` lets `mapOf` accept `Promise<T>` as a Map value while
  preserving scalar-only Map keys.
- `src/codegen.ts:560` lets `setOf` accept `Promise<T>` as a Set element.
- `src/codegen.ts:742` gives `Promise<T>` a container element tag derived from
  `typeIdent`.
- `src/codegen.ts:3441` emits `Array<Promise<T>>` with `void *` elements via
  `cElemTypeForContainer`.
- `src/codegen.ts:3478` emits dynamic `Map<K, Promise<T>>` monomorphs with
  `void *` value/optional types, `NULL` absent, and passthrough wrapping.
- `src/codegen.ts:3508` and `src/codegen.ts:3557` emit `Set<Promise<T>>`
  monomorphs and per-promise pointer identity hash/equality helpers.

## Consequences

- **Accepted**: aliases, fields, params, locals, constructors, array literals,
  and existing container methods for `Array<Promise<T>>`,
  `Map<string, Promise<T>>`, `Map<string, Promise<Promise<T>>>`, and
  `Set<Promise<T>>`.
- **Rejected**: `Map<Promise<T>, V>` keys, unsupported Promise payloads,
  Promise combinators, thenable / `PromiseLike` bridge behavior, scheduler
  changes, and new `await` placement.
- **Preserved**: Promise method scheduling and settlement semantics are
  unchanged.
- **Regression**: `promise_container_annotation` and
  `promise_map_key_deferred_fail`.
- **Regression count**: smoke now covers 590 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
