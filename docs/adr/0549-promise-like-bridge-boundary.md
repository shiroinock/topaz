# 0549 - promise like bridge boundary

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.82

## Context

ADR [0467](./0467-post-v0-2-typescript-compatibility-priorities.md)
split async compatibility into Node-compatible migration semantics and a future
Topaz-owned parallel scheduler. ADR [0542](./0542-promise-like-type-frontier.md)
reserved `PromiseLike<T>` as a distinct annotation-only type, and ADRs
[0543](./0543-promise-like-container-annotation.md) through
[0548](./0548-promise-field-extraction.md) pinned storage and extraction
surfaces without bridge semantics. The next compatibility step needs a stable
handoff point before accepting `await PromiseLike<T>` or
`Promise.resolve(PromiseLike<T>)`.

## Decision

Keep `PromiseLike<T>` distinct from `Promise<T>`. The first bridge will be an
explicit static `PromiseLike<T>` to Topaz-owned `Promise<T>` conversion, reused
by future `await PromiseLike<T>` operands and
`Promise.resolve(PromiseLike<T>)`. Both sites should route through a
compiler-owned bridge helper that settles a Topaz Promise by using the existing
FIFO microtask queue and Promise settlement machinery. The helper must not
synchronously unwrap values or introduce a new scheduler.

Rejected alternatives: aliasing `PromiseLike<T>` to `Promise<T>` would erase
the bridge boundary and make storage-only values look native; accepting
arbitrary `{ then(...) { ... } }` shapes would combine type spelling, shape
probing, callback normalization, rejection propagation, and scheduler semantics
too early; adding a new bridge scheduler or making ordinary `await` parallel by
default would violate the Node-compatible single-thread mode and leave no
stable migration story.

## Implementation

- `MEMO.md:475` records Phase 5.82 as a design/static-contract pin and keeps
  storage-only `PromiseLike<T>` annotations valid.
- `tests/smoke.sh:400` names this ADR for the normal smoke contract.
- `tests/smoke.sh:891` checks the ADR and `MEMO.md` for the bridge boundary
  fragments: `PromiseLike<T>`, `explicit bridge`, `Promise.resolve`,
  `controlled static thenable assimilation`, `Node-compatible single-thread`,
  `Topaz-owned parallel scheduler`, and `storage-only`.
- No `src/`, `runtime/`, generated runtime, or package metadata changes are
  made in this phase.

## Consequences

- **Accepted**: existing storage/extraction samples remain valid and
  non-awaitable until the bridge phase explicitly changes them.
- **Accepted**: later `await PromiseLike<T>` can become a thin compiler-owned
  bridge over the current Topaz Promise machinery.
- **Rejected**: arbitrary structural thenable probing, synchronous unwrap,
  scheduler replacement, default parallel `await`, unhandled rejection
  reporting changes, and richer scheduler APIs.
- **Regression**: `promise_like_bridge_boundary_contract` static smoke
  contract; existing `promise_like_await_deferred_fail` and
  `promise_like_*_await_deferred_fail` examples keep executable diagnostics.
- **Regression count**: smoke still covers 598 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries, plus this static
  ADR/MEMO contract.
