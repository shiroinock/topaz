# 0537 - promise then undefined handler normalization

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.70

## Context

ADR [0511](./0511-promise-then-rejection-continuations.md) added two-handler
`.then(onFulfilled, onRejected)` but deliberately deferred optional handler
normalization. ADR [0518](./0518-promise-then-mixed-branch-static-assimilation.md)
then allowed mixed value/Promise branch assimilation while still leaving
explicit omitted-handler spellings out of scope. Common TS-authored chains spell
an omitted handler as `undefined`, and the runtime already has bypass
propagation for one-handler `.then` and `.catch`, so this gap can close without
adding scheduler or thenable semantics.

## Decision

Recognize only explicit `undefined` as an omitted `Promise.then` handler. The
`then(onFulfilled, undefined)` spelling reuses the existing fulfilled-only
`.then` inference and `topaz_promise_then` lowering. The
`then(undefined, onRejected)` spelling reuses catch-like recovery and is
accepted only when the rejected callback's normalized value/Promise payload
matches the original source payload `T`, producing `Promise<T>`.

Rejected alternatives: normalizing arbitrary non-function handlers would hide
Topaz programmer mistakes; accepting `null` would introduce a value surface not
owned by this Promise policy; joining `T | U` from catch-like recovery remains
deferred by ADR 0518; treating `then(undefined, undefined)` as source identity
would bake in incorrect JS promise identity behavior; adding a runtime helper is
unnecessary because existing `.then` and `.catch` paths already provide the
right bypass propagation.

## Implementation

- `src/codegen.ts:12619` recognizes explicit `undefined` handler expressions,
  including parenthesized spellings.
- `src/codegen.ts:12667` specializes inference for second-handler
  `undefined`, first-handler `undefined`, and both-handler `undefined` before
  the ordinary two-function branch.
- `src/codegen.ts:12976` lowers first-handler `undefined` through the existing
  `topaz_promise_catch` runner path.
- `examples/promise_then_undefined_handlers.ts` covers fulfilled-only
  second-handler `undefined`, catch-like recovery, fulfilled bypass,
  Promise-return recovery, and `Promise<void>` recovery/fulfilled cases.
- `examples/promise_then_undefined_on_rejected_mismatch_fail.ts` and
  `examples/promise_then_both_undefined_fail.ts` pin the new focused rejects.
- `MEMO.md:463` records the 5.70 boundary without reopening `null`, arbitrary
  handler normalization, thenables, result unions, or scheduler APIs.

## Consequences

- **Accepted**: explicit `undefined` second handlers on fulfilled-only `.then`,
  and explicit `undefined` first handlers when `onRejected` normalizes to the
  source payload.
- **Rejected**: `then(undefined, undefined)`, catch-like recovery that changes
  the source payload, `null`, arbitrary non-function handlers, PromiseLike /
  thenable probing, and public scheduler additions.
- **Preserved**: existing two-function `.then` branch diagnostics and
  value/Promise branch compatibility, plus existing non-function first-handler
  failures when the first argument is not explicit `undefined`.
- **Regression**: `promise_then_undefined_handlers`,
  `promise_then_undefined_on_rejected_mismatch_fail`, and
  `promise_then_both_undefined_fail`.
- **Regression count**: smoke now covers 570 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
