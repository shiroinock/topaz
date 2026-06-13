# 0468 - promise type frontier

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.1

## Context

Phase 5.0 reset the post-v0.2 priority toward TypeScript compatibility and
placed async/await first in the roadmap. ADR [0327](./0327-fiber-async-await-design.md)
already chose Topaz-owned `Promise<T>` and rejected fake synchronous Promise
semantics, but the current compiler still reported `Promise.resolve` as
`unknown identifier 'Promise'`. That made the async frontier look accidental
instead of an explicit missing runtime/scheduler boundary.

## Decision

Introduce `Promise<T>` as a reserved built-in type reference with exactly one
payload type argument. The payload may be a value-representable Topaz type or
`void`; `unknown`, bare `undefined`, and unsupported/general unions remain
rejected. C signatures spell promises as opaque `void *` so annotations and
function types can compile before allocation, resolution, continuations, or
microtasks exist. Rejected alternatives: implementing `Promise.resolve` as an
immediate wrapper would violate ADR 0327's ordering model; accepting `await` or
`async function` now would require scheduler/frame lowering; implementing
`PromiseLike`, thenable assimilation, `.then`, `.catch`, `.finally`, or
combinators would expand the value protocol before the owned Promise runtime.

## Implementation

- `src/codegen.ts:73` adds the `promise` `TopazType` shape, and
  `src/codegen.ts:296` gates payloads through the value-representable frontier.
- `src/codegen.ts:526` includes promise identities in diagnostics/type keys,
  while `src/codegen.ts:664` gives promise values the opaque C pointer spelling.
- `src/codegen.ts:4038` resolves `Promise<T>` as a built-in type reference and
  rejects wrong arity or unsupported payloads with Promise-specific diagnostics.
- `src/codegen.ts:9245`, `src/codegen.ts:9335`, and `src/codegen.ts:11562`
  route Promise value namespace and method use to deferred runtime/scheduler
  diagnostics instead of generic unknown-identifier errors.
- `examples/promise_type_annotation.ts:1` is the positive TS-compatible sample;
  `examples/promise_payload_unknown_deferred_fail.ts:1` fixes the payload reject.

## Consequences

- **Accepted**: `Promise<number>`, `Promise<string>`, `Promise<void>`,
  `Promise<Array<number>>`, and `Promise<ClassName>` can appear in annotations
  and function signatures without constructing a Promise value.
- **Rejected**: `Promise` with the wrong type-argument count,
  `Promise<unknown>`, `Promise<undefined>`, unsupported/general-union payloads,
  `Promise.resolve`, `Promise.reject`, and Promise instance methods remain
  deferred with explicit runtime/scheduler diagnostics.
- **Regression**: `promise_type_annotation`, `promise_resolve_deferred_fail`,
  `promise_payload_unknown_deferred_fail`, plus the unchanged
  `async_function_deferred_fail`, `await_expression_deferred_fail`, and
  `for_await_deferred_fail`; the smoke suite now has 387 explicit run entries.
- **Scope out**: no scheduler, continuation frame, allocation, fulfillment,
  rejection, microtask queue, thenable assimilation, async function lowering,
  `await`, async arrows/methods, or for-await behavior is implemented here.
