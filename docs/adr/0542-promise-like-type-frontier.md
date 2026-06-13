# 0542 - promise like type frontier

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.75

## Context

ADR [0467](./0467-post-v0-2-typescript-compatibility-priorities.md)
kept explicit `PromiseLike` bridge work in the async compatibility roadmap,
after the Topaz-owned `Promise<T>` MVP and before controlled thenable
assimilation. ADR [0541](./0541-promise-handler-sentinel-normalization.md)
closed the current Promise handler sentinel surface, but migration-facing
TypeScript declarations often mention `PromiseLike<T>` in signatures and
fields even when no real thenable bridge is needed yet.

## Decision

Reserve `PromiseLike<T>` as a distinct built-in annotation type with opaque
`void *` representation. It uses the existing Topaz Promise payload gate for
its own payload, but it is not a `Promise<T>` alias and is not accepted by
`Promise.resolve` / Promise method assimilation paths. Ordinary annotations,
class fields, locals, function types, and Array elements can carry an existing
`PromiseLike<T>` value. `await PromiseLike<T>`, async return annotation
`PromiseLike<T>`, and `Promise.resolve(PromiseLike<T>)` remain rejected with
focused deferred-bridge diagnostics.

Rejected alternatives: aliasing `PromiseLike<T>` to `Promise<T>` would erase
the future bridge boundary; structural `.then` probing would open scheduling,
return normalization, and rejection propagation together; accepting arbitrary
thenables by shape or changing scheduler behavior is deferred to a separate
static assimilation design.

## Implementation

- `src/codegen.ts:94` adds the `promise_like` `TopazType` variant.
- `src/codegen.ts:600` keeps annotation-only `Promise<PromiseLike<T>>` spelling
  separate from value assimilation, while `src/codegen.ts:607` builds
  `PromiseLike<T>` only when the payload would be admissible for `Promise<T>`.
- `src/codegen.ts:833` gives `PromiseLike<T>` a distinct `typeIdent`, and
  `src/codegen.ts:999` maps the C representation to opaque `void *`.
- `src/codegen.ts:4913` accepts the built-in `PromiseLike<T>` annotation and
  preserves the focused unsupported-payload diagnostic.
- `src/codegen.ts:6890` centralizes non-Promise await operand diagnostics so
  `PromiseLike<T>` reports the deferred bridge boundary instead of a generic
  `got topaz_promise_like_T` message.
- `src/codegen.ts:2780`, `src/codegen.ts:3966`, and `src/codegen.ts:6905`
  reject async function, method, and arrow return annotations that spell
  `PromiseLike<T>` directly.
- `src/codegen.ts:3590` lets `Array<PromiseLike<T>>` monomorphs store the
  opaque pointer representation.

## Consequences

- **Accepted**: `PromiseLike<T>` in aliases, signatures, fields, locals,
  function types, and Array element annotations, including nested
  `PromiseLike<Promise<T>>`.
- **Rejected**: `PromiseLike<unknown>`, `PromiseLike<undefined>`, unsupported
  union payloads, `await PromiseLike<T>`, async `PromiseLike<T>` return
  annotations, `Promise.resolve(PromiseLike<T>)`, arbitrary thenables,
  structural `.then` probing, and scheduler changes.
- **Preserved**: Topaz-owned `Promise<T>` behavior and Promise method
  assimilation paths stay unchanged.
- **Regression**: `promise_like_type_annotation`,
  `promise_like_await_deferred_fail`, `promise_like_async_return_fail`,
  `promise_like_resolve_deferred_fail`, and
  `promise_like_unknown_payload_fail`.
- **Regression count**: smoke now covers 583 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
