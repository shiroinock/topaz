# 0547 - promise array extraction

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.80

## Context

ADR [0544](./0544-promise-container-annotation.md) made
`Array<Promise<T>>` a valid opaque storage annotation, while ADR
[0543](./0543-promise-like-container-annotation.md) and ADR
[0546](./0546-promise-optional-extraction.md) kept the `PromiseLike<T>`
bridge boundary explicit. Before later thenable work, array element access and
array `for-of` need coverage showing that async opaque values move through
arrays without becoming awaitable or changing scheduler behavior.

## Decision

Preserve `Promise<T>` and `PromiseLike<T>` array extraction as ordinary
reference-like value movement. `Array<Promise<T>>` elements can be indexed,
pushed, copied into another array, nested inside `Array<Array<Promise<T>>>`,
and iterated with array `for-of`. `Array<PromiseLike<T>>` can also be iterated
as storage-only values, but extracted `PromiseLike<T>` values remain
non-awaitable.

Rejected alternatives: adding `await PromiseLike<T>` would decide the thenable
bridge and assimilation semantics too early; adding PromiseLike-to-Promise
coercion would blur the explicit storage boundary; adding Promise combinators,
array methods with equality policy, Promise / PromiseLike Map keys, or
scheduler/task-queue changes is outside this extraction pin.

## Implementation

- `examples/promise_array_extraction.ts` covers `Array<Promise<T>>` element
  access, `push`, copying, nested array access, array `for-of`, and empty
  `Array<PromiseLike<T>>` iteration.
- `examples/promise_like_array_await_deferred_fail.ts` preserves the existing
  bridge-deferred diagnostic after `PromiseLike<T>` is extracted from an array.
- `tests/smoke.sh` adds the positive and fail regressions without changing
  `src/codegen.ts`, because the existing opaque array extraction path already
  handles the accepted surface.
- `MEMO.md` records phase 5.80 and keeps PromiseLike await, thenable
  assimilation, PromiseLike-to-Promise coercion, Promise combinators, and
  Promise / PromiseLike Map keys deferred.

## Consequences

- **Accepted**: `Array<Promise<T>>` literals and `push`, `values[i]` typed as
  `Promise<T>`, array `for-of` binding typed as `Promise<T>` or
  `PromiseLike<T>`, and nested `Array<Array<Promise<T>>>` access.
- **Rejected**: awaiting extracted `PromiseLike<T>`, PromiseLike-to-Promise
  coercion, Promise combinators, Promise / PromiseLike Map keys, and scheduler
  changes.
- **Regression**: `promise_array_extraction` and
  `promise_like_array_await_deferred_fail`.
- **Regression count**: smoke now covers 599 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
