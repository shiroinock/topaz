# 0545 - promise iterator annotation

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.78

## Context

ADR [0543](./0543-promise-like-container-annotation.md) and ADR
[0544](./0544-promise-container-annotation.md) let `PromiseLike<T>` and
`Promise<T>` values live in existing container storage. The remaining mismatch
was the iterator annotation gate: `Iterator<T>` and iterator `_next` done-path
zero values only knew scalar, class, and interface elements, so `.values()`
and iterable `Set` construction could not carry async opaque pointers even
though Map/Set storage already had a representation for them.

## Decision

Accept `Promise<T>` and `PromiseLike<T>` as `Iterator<T>` element types. The
iterator ABI stays the existing fat pointer `{ state, next }`, while the
ignored done-path return value for async opaque pointer elements is
`(${cTypeName(elem)})NULL`. This keeps PromiseLike bridge behavior,
thenable assimilation, Promise keys, and scheduler/task-queue semantics
outside this phase.

Rejected alternatives: broadening `Iterator<T>` to every value-representable
type would publish nested-container, dunion, array, brand, and function-value
iterator semantics without coverage; treating `PromiseLike<T>` as
`Promise<T>` would erase the explicit bridge boundary from ADR 0542; Promise
or PromiseLike Map keys need a separate hash/equality decision; `await
PromiseLike<T>` and `Promise.resolve(PromiseLike<T>)` require thenable
probing rather than storage/extraction lowering.

## Implementation

- `src/codegen.ts:1077` returns `NULL` from `zeroValueOfElem` for
  `Promise<T>` and `PromiseLike<T>` iterator done paths.
- `src/codegen.ts:4945` keeps `Iterator<T>` first-class annotations narrow
  but documents async opaque pointers as an accepted element shape.
- `src/codegen.ts:4958` admits `promise` and `promise_like` elements in the
  `Iterator<T>` annotation predicate.
- `src/codegen.ts:4962` updates the unsupported element diagnostic to mention
  `Promise / PromiseLike`.

## Consequences

- **Accepted**: aliases and bindings for `Iterator<Promise<T>>` and
  `Iterator<PromiseLike<T>>`, direct `for-of` over async-valued Set and
  Map `.values()`, bound `.values()` / `.keys()` iterator variables, and
  `new Set<Promise<T>>(iterator)` / `new Set<PromiseLike<T>>(iterator)`.
- **Rejected**: `Iterator<Array<Promise<T>>>` and other nested container
  iterator elements, unsupported Promise payloads, Promise / PromiseLike Map
  keys, `await PromiseLike<T>`, thenable probing, and scheduler work.
- **Regression**: `promise_iterator_annotation` and
  `promise_iterator_nested_container_deferred_fail`.
- **Regression count**: smoke now covers 589 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
