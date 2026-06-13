# 0511 - promise then rejection continuations

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.44

## Context

ADR [0510](./0510-promise-catch-rejection-continuations.md) introduced
rejection continuations for `.catch`, but two-handler `.then(onFulfilled,
onRejected)` still failed at arity checking. That left common recovery flows
unable to express "map fulfilled value or recover rejected value" without a
separate `.catch`, even though the runtime already had fulfillment and rejection
continuation kinds.

## Decision

Accept `Promise<T>.then(onFulfilled, onRejected)` when both callbacks return
exactly the same non-Promise result type `U`; the chained result is
`Promise<U>`. Fulfillment callbacks keep the existing `.then` parameter shape:
`Promise<void>` passes no value and `Promise<T>` passes one `T`. Rejection
callbacks use the same `unknown` parameter shape as `.catch`. Both continuations
share one target promise, and only the branch matching the source state may
settle it. Rejected alternatives: result type joins/unions, optional
non-function handler normalization, Promise-returning callback assimilation,
and `.finally` all remain separate work.

## Implementation

- `runtime/runtime.h:103` adds a `propagate_on_bypass` bit to Promise
  continuations so single-handler `.then` / `.catch` can keep bypass
  propagation while two-handler `.then` disables the inactive branch.
- `runtime/runtime.h:164` and `runtime/runtime.h:233` thread the bypass flag
  through pending and already-settled source paths without adding a new runtime
  substrate symbol.
- `src/codegen.ts:11768` validates the rejected callback as
  `(unknown) => U`, and `src/codegen.ts:11787` accepts arity one or two while
  rejecting Promise-returning callbacks and mismatched branch result types.
- `src/codegen.ts:11962` lowers two-handler `.then` by allocating one target
  promise and registering fulfillment and rejection continuations against the
  same source with bypass propagation disabled.
- `src/runtime_header.ts` was regenerated from `runtime/runtime.h`.

## Consequences

- **Accepted**: `promise_then_on_rejected` covers fulfilled branch execution,
  rejected branch recovery, `Promise<void>` two-handler chaining, FIFO
  microtask ordering, and handler throw recovery through `.catch`.
- **Rejected**: concrete rejected-handler parameter types, branch return
  mismatches, Promise-returning rejected handlers, wrong `.then` arity, and
  non-function fulfilled callbacks remain smoke-pinned.
- **Regression**: smoke now covers 475 explicit run entries, including
  `promise_then_on_rejected`,
  `promise_then_on_rejected_param_fail`,
  `promise_then_on_rejected_return_mismatch_fail`,
  `promise_then_on_rejected_return_promise_fail`, and
  `promise_then_wrong_arity_fail`. The positive TypeScript syntax check is
  `pnpm exec tsc --noEmit --skipLibCheck examples/promise_then_on_rejected.ts`.
- **Scope out**: no result join policy, optional handler normalization,
  thenable assimilation, `.finally`, unhandled rejection reporting, public
  scheduler API, or async frame rejection resumption is implemented here.
