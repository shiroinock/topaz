# 0548 - promise field extraction

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.81

## Context

ADR [0547](./0547-promise-array-extraction.md) pinned opaque Promise and
PromiseLike movement through array extraction. The remaining storage surface in
this track is field movement: concrete class fields and interface field
getter/setter dispatch should preserve `Promise<T>` values without changing
settlement semantics, while `PromiseLike<T>` fields must stay storage-only.

## Decision

Preserve `Promise<T>` field extraction as ordinary opaque reference movement.
Concrete class fields and interface fields can store, read, reassign, and pass
`Promise<T>` values to the existing `.then` continuation surface. Also preserve
`PromiseLike<T>` as a field annotation and helper-signature storage type only;
reading a `PromiseLike<T>` field does not make it awaitable.

Rejected alternatives: adding `await PromiseLike<T>` would decide the explicit
thenable bridge too early; adding PromiseLike-to-Promise coercion or structural
thenable probing would blur the storage-only boundary; adding Promise
combinators, Promise / PromiseLike Map keys, top-level await, or scheduler
changes is outside this field extraction pin.

## Implementation

- `examples/promise_field_extraction.ts` covers concrete class field storage,
  reassignment, method reads, interface field getter/setter dispatch, and
  extracted `Promise<T>` values passed to `.then`.
- The same sample declares `PromiseLike<T>` concrete/interface field carriers
  and typed helper functions without constructing bridge values at runtime.
- `examples/promise_like_field_await_deferred_fail.ts` preserves the existing
  bridge-deferred diagnostic after `PromiseLike<T>` is extracted from a field.
- `tests/smoke.sh` adds the positive and fail regressions without changing
  `src/codegen.ts`, because the existing opaque field path already handles the
  accepted surface.
- `MEMO.md` records phase 5.81 and keeps PromiseLike await, thenable
  assimilation, PromiseLike-to-Promise coercion, Promise combinators, Promise /
  PromiseLike Map keys, top-level await, and scheduler/task-queue changes
  deferred.

## Consequences

- **Accepted**: `Promise<T>` in concrete class fields, `Promise<T>` in
  interface fields, reassignment from another `Promise<T>`, and `.then` on
  extracted field values.
- **Rejected**: awaiting extracted `PromiseLike<T>`, PromiseLike-to-Promise
  coercion, structural thenable probing, Promise combinators, Promise /
  PromiseLike Map keys, top-level await, and scheduler changes.
- **Regression**: `promise_field_extraction` and
  `promise_like_field_await_deferred_fail`.
- **Regression count**: smoke now covers 595 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
