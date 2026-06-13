# 0538 - promise undefined passthrough handlers

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.71

## Context

ADR [0537](./0537-promise-then-undefined-handler-normalization.md) accepted
explicit `undefined` as an omitted `.then` handler when at least one real
function handler remained. It deliberately left `then(undefined, undefined)`
out of scope because returning the source Promise would bake in the wrong
identity semantics. The runtime already has `topaz_promise_forward_into`, so
the remaining explicit omitted-handler spellings can create a fresh Promise
without adding scheduler or runtime ABI surface.

## Decision

Recognize only explicit `undefined` as a pass-through handler for
`then(undefined, undefined)`, `catch(undefined)`, and `finally(undefined)`.
Each form infers `Promise<T>`, allocates a fresh pending Promise, and forwards
the source settlement into that target with `topaz_promise_forward_into`.

Rejected alternatives: returning the source Promise directly would lose the
fresh-Promise shape; adding a runtime helper duplicates
`topaz_promise_new_pending` plus `topaz_promise_forward_into`; normalizing
arbitrary non-function handlers or `null` broadens the compatibility surface
beyond explicit TS-authored omitted handlers; accepting wrong arity remains a
separate API-shape decision; result joins and thenable probing remain deferred
from ADR [0518](./0518-promise-then-mixed-branch-static-assimilation.md).

## Implementation

- `src/codegen.ts:12674` now infers `then(undefined, undefined)` as the source
  `Promise<T>` instead of rejecting it.
- `src/codegen.ts:12759` and `src/codegen.ts:12797` infer
  `catch(undefined)` and `finally(undefined)` as pass-through `Promise<T>`.
- `src/codegen.ts:12984` adds a shared pass-through emitter that evaluates the
  source once, allocates a fresh target, and calls `topaz_promise_forward_into`.
- `src/codegen.ts:13010`, `src/codegen.ts:13085`, and `src/codegen.ts:13112`
  route the three explicit-`undefined` method forms through that helper.
- `examples/promise_undefined_passthrough_handlers.ts` covers fulfilled and
  rejected pass-through for `.then`, `.catch`, `.finally`, plus `Promise<void>`.
- `examples/promise_then_null_handler_fail.ts` keeps `null` outside the newly
  accepted omitted-handler surface.
- `MEMO.md:464` records the phase boundary without reopening arbitrary
  handler normalization, wrong arity, thenables, result joins, or scheduler
  APIs.

## Consequences

- **Accepted**: explicit `then(undefined, undefined)`, `catch(undefined)`, and
  `finally(undefined)` as fresh-Promise settlement forwarding.
- **Rejected**: `null`, numeric/string/object non-function handlers, wrong
  arity, source Promise identity shortcuts, PromiseLike / thenable probing,
  result union joins, and scheduler APIs.
- **Preserved**: existing callback diagnostics for non-`undefined`
  non-functions and existing wrong-arity failures for the three methods.
- **Regression**: `promise_undefined_passthrough_handlers` and
  `promise_then_null_handler_fail`.
- **Regression count**: smoke now covers 571 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
