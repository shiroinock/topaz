# 0550 - promise like native adapter

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.83

## Context

ADR [0549](./0549-promise-like-bridge-boundary.md) kept `PromiseLike<T>` distinct
from `Promise<T>` and reserved an explicit compiler-owned bridge before
accepting `await PromiseLike<T>` or `Promise.resolve(PromiseLike<T>)`. The
storage and extraction pins from ADRs [0543](./0543-promise-like-container-annotation.md)
through [0548](./0548-promise-field-extraction.md) can keep their reference-like
ABI if the first bridge is a descriptor pointer rather than a raw Promise alias.

## Decision

Introduce `topaz_promise_like` as a runtime descriptor whose first variant wraps
a native Topaz Promise. `PromiseLike<T>` remains a distinct `TopazType`, but its
C representation is now `topaz_promise_like *`; `emitWithExpected` converts a
static `Promise<T>` expression to an expected `PromiseLike<T>` slot by calling
`topaz_promise_like_from_promise(...)` when payload types match. The runtime also
adds `topaz_promise_like_to_promise(...)` as future substrate that forwards the
native Promise settlement into a fresh Topaz Promise through the existing FIFO
continuation machinery.

Rejected alternatives: aliasing `PromiseLike<T>` to `Promise<T>` would erase the
bridge boundary from ADR 0549; keeping `PromiseLike<T>` as raw `void *` would
hide the later non-native thenable variant boundary; accepting `await
PromiseLike<T>` or `Promise.resolve(PromiseLike<T>)` here would combine adapter
storage with assimilation semantics; structural `.then` probing still needs a
later controlled static thenable design.

## Implementation

- `runtime/runtime.h:122` defines `topaz_promise_like`, `runtime/runtime.h:148`
  wraps native Promises, and `runtime/runtime.h:364` exposes the future
  descriptor-to-Promise forwarding helper.
- `scripts/check-runtime-substrate.mjs:354` classifies the descriptor helpers
  under the Promise continuation boundary, and `tests/smoke.sh:993` updates the
  pinned inventory count.
- `src/codegen.ts:1001` changes `cTypeName(PromiseLike<T>)` to
  `topaz_promise_like *`; `src/codegen.ts:17265` and `src/codegen.ts:17702`
  accept matching `Promise<T>` to `PromiseLike<T>` only through coercion.
- `examples/promise_like_native_adapter.ts:1` covers local initialization,
  parameter passing, sync returns, Array / Map / Set storage, fields, and nested
  native Promise payloads.
- `examples/promise_like_structural_adapter_fail.ts:1` keeps a TS-valid
  structural thenable outside the adapter surface before any `.then` probing.

## Consequences

- **Accepted**: Topaz-owned `Promise<T>` values can flow into expected
  `PromiseLike<T>` slots through an explicit descriptor wrapper.
- **Rejected**: `await PromiseLike<T>`, `Promise.resolve(PromiseLike<T>)`, async
  `PromiseLike<T>` return annotations, arbitrary structural thenable probing,
  unhandled rejection reporting changes, and scheduler changes stay out of
  scope.
- **Regression**: `promise_like_native_adapter` and
  `promise_like_structural_adapter_fail`; smoke now covers 600 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries, plus the existing
  static ADR/MEMO contract.
