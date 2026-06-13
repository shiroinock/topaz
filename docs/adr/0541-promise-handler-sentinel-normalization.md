# 0541 - promise handler sentinel normalization

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.74

## Context

ADR [0537](./0537-promise-then-undefined-handler-normalization.md) accepted
explicit `undefined` in `.then` positions when another real handler remained.
ADR [0538](./0538-promise-undefined-passthrough-handlers.md) then accepted
all-`undefined` pass-through forms as fresh forwarded Promises. JS-compatible
Promise code also commonly spells absent handlers as `null`, and the
one-argument `.then(undefined)` shape was still an avoidable gap, but Topaz
does not otherwise own general `null` value semantics.

## Decision

Normalize only syntactic `undefined` and `null` literals as Promise handler
sentinels inside `Promise.then`, `Promise.catch`, and `Promise.finally`
argument handling. One-argument `.then(sentinel)`, two-sentinel `.then`,
`.catch(sentinel)`, and `.finally(sentinel)` infer `Promise<T>` and lower
through the existing fresh pass-through forwarding path. Mixed
sentinel/callable `.then` forms keep the existing catch-like recovery and
fulfilled-only branches, including the source-payload compatibility check for
catch-like recovery.

Rejected alternatives: accepting arbitrary non-function handlers would hide
Topaz type mistakes; adding a general `null` type/value would widen expression
semantics beyond this Promise slice; returning the source Promise directly
would lose the fresh-Promise behavior from ADR 0538; PromiseLike probing,
result union joins, and scheduler changes remain later explicit decisions.

## Implementation

- `src/codegen.ts:12699` replaces the `undefined`-only helper with a syntactic
  handler sentinel helper for parenthesized `undefined` or `null` literals.
- `src/codegen.ts:12752` infers one-argument sentinel `.then` as source
  `Promise<T>`, and `src/codegen.ts:12756` reuses the same sentinel check for
  two-argument pass-through, catch-like, and fulfilled-only `.then` forms.
- `src/codegen.ts:12843` and `src/codegen.ts:12881` route `.catch(null)` and
  `.finally(null)` through the existing pass-through type path.
- `src/codegen.ts:13089` lowers one-argument sentinel `.then` to the shared
  fresh forwarding helper, while `src/codegen.ts:13094` keeps the two-sentinel
  pass-through and mixed sentinel/callable branches on their existing runtime
  paths.
- `examples/promise_handler_sentinel_normalization.ts` covers `.then(undefined)`,
  `.then(null)`, two-argument sentinel pairs, callable+sentinel,
  sentinel+callable, `.catch(null)`, and `.finally(null)`.
- `examples/null_expression_fail.ts` replaces the obsolete
  `promise_then_null_handler_fail` row so bare `null` expressions remain
  unsupported outside Promise handler positions.

## Consequences

- **Accepted**: explicit `undefined` / `null` Promise handler sentinels in the
  focused handler positions, including one-argument `.then`.
- **Rejected**: general `null`, numeric/string/object non-function handlers,
  result union joins, PromiseLike / thenable probing, and scheduler changes.
- **Preserved**: existing non-callable rejects such as `then(123)` and
  `finally(123)`, plus existing callback payload compatibility diagnostics.
- **Regression**: `promise_handler_sentinel_normalization` and
  `null_expression_fail`.
- **Regression count**: smoke now covers 584 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
