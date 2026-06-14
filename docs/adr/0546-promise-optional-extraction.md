# 0546 - promise optional extraction

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.79

## Context

ADR [0543](./0543-promise-like-container-annotation.md), ADR
[0544](./0544-promise-container-annotation.md), and ADR
[0545](./0545-promise-iterator-annotation.md) made `PromiseLike<T>` and
`Promise<T>` usable as opaque values in containers and iterators. Map value
optionals already use the same pointer representation as the stored value with
`NULL` as the absent sentinel, but the practical extraction path was not pinned
for async opaque pointer values before any later `PromiseLike` bridge work.

## Decision

Preserve `Promise<T>` and `PromiseLike<T>` optionals as reference-like
`T | undefined` values through `Map.get`, equality narrowing against
`undefined`, nullish coalescing, non-null assertion, and explicit optional local
annotations. `PromiseLike<T>` remains a storage/extraction-only annotation in
this surface: narrowing it to `PromiseLike<T>` does not make it awaitable and
does not assimilate it into `Promise<T>`.

Rejected alternatives: adding `await PromiseLike<T>` would decide the thenable
bridge and assimilation semantics too early; allowing `PromiseLike<T> |
undefined ?? Promise<T>` would erase the explicit bridge boundary; accepting
Promise or PromiseLike Map keys would expose key hash/equality policy; adding
Promise combinators or scheduler changes is unrelated to optional extraction.

## Implementation

- `examples/promise_optional_extraction.ts` covers `Map<string, Promise<T>>`
  and `Map<string, PromiseLike<T>>` extraction, `undefined` comparisons,
  `??`, `!`, and explicit optional local annotations.
- `examples/promise_like_optional_await_deferred_fail.ts` preserves the
  bridge-deferred diagnostic after `PromiseLike<T> | undefined` is extracted
  with the same reference-like non-null path.
- `tests/smoke.sh` adds the positive and fail regressions without changing
  `src/codegen.ts`, because the existing reference-like optional path already
  handles the accepted surface.
- `MEMO.md` records phase 5.79 and keeps `PromiseLike` await, thenable
  assimilation, and Promise / PromiseLike Map keys deferred.

## Consequences

- **Accepted**: `Map<string, Promise<T>>.get(key)` and
  `Map<string, PromiseLike<T>>.get(key)` produce optionals that narrow with
  `!== undefined` / `=== undefined`; `Promise<T> | undefined` supports `??`
  fallback and non-null assertion; explicit `Promise<T> | undefined` and
  `PromiseLike<T> | undefined` locals are accepted.
- **Rejected**: narrowed `PromiseLike<T>` is still not awaitable, PromiseLike
  to Promise coalescing remains a type mismatch, and Promise / PromiseLike Map
  keys remain deferred.
- **Regression**: `promise_optional_extraction` and
  `promise_like_optional_await_deferred_fail`.
- **Regression count**: smoke now covers 597 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
