# 0543 - promise like container annotation

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.76

## Context

ADR [0542](./0542-promise-like-type-frontier.md) reserved
`PromiseLike<T>` as a distinct opaque annotation type rather than a
`Promise<T>` alias. That was enough for signatures, fields, locals, function
types, and Array elements, but migration-facing TypeScript declarations also
spell `Map<string, PromiseLike<T>>` and `Set<PromiseLike<T>>` when they only
need storage and type compatibility.

## Decision

Accept `Map<K, PromiseLike<T>>` for scalar keys and `Set<PromiseLike<T>>` as
storage/type annotations only. The `PromiseLike<T>` value remains an opaque
pointer with no thenable probing, no `Promise<T>` assimilation, and no scheduler
semantics. `Map<K, PromiseLike<T>>` uses the existing scalar-key map path with
the opaque pointer as both value and optional value type, `NULL` as the absent
sentinel, and passthrough optional wrapping. `Set<PromiseLike<T>>` uses opaque
pointer identity: `topaz_hash_pointer((const void *)p)` and `a == b`.

Rejected alternatives: allowing `Map<PromiseLike<T>, V>` keys would expose
opaque identity as public key hashing/equality semantics; aliasing
`PromiseLike<T>` to `Promise<T>` would erase the bridge boundary from ADR 0542;
structural `.then` probing, `await PromiseLike<T>`, and
`Promise.resolve(PromiseLike<T>)` would combine type spelling with runtime
assimilation and remain separate future work.

## Implementation

- `src/codegen.ts:547` lets `mapOf` accept `PromiseLike<T>` as a Map value
  while preserving scalar-only keys.
- `src/codegen.ts:559` lets `setOf` accept `PromiseLike<T>` as a Set element.
- `src/codegen.ts:3484` reuses `cElemTypeForContainer` for Map values and
  adds `NULL` as the optional absent sentinel for `PromiseLike<T>`.
- `src/codegen.ts:3505` routes `Set<PromiseLike<T>>` through dynamic
  `TOPAZ_SET_DEFINE` emission.
- `src/codegen.ts:3554` emits per-`PromiseLike<T>` Set hash/equality helpers
  using opaque pointer identity.

## Consequences

- **Accepted**: aliases, fields, params, locals, and constructors for
  `Map<string, PromiseLike<T>>`, `Map<string, PromiseLike<Promise<T>>>`, and
  `Set<PromiseLike<T>>`.
- **Rejected**: `Map<PromiseLike<T>, V>` keys, unsupported `PromiseLike<T>`
  payloads, `await PromiseLike<T>`, async `PromiseLike<T>` return annotations,
  `Promise.resolve(PromiseLike<T>)`, arbitrary thenables, structural `.then`
  probing, and scheduler changes.
- **Preserved**: `PromiseLike<T>` remains distinct from `Promise<T>`, and
  Topaz-owned Promise method assimilation paths are unchanged.
- **Regression**: `promise_like_container_annotation` and
  `promise_like_map_key_deferred_fail`.
- **Regression count**: smoke now covers 585 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
