# 0517 - promise finally ignored primitive cleanup

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.50

## Context

ADR [0516](./0516-promise-finally-static-promise-cleanup.md) completed
static Topaz `Promise<U>` cleanup waiting for `Promise<T>.finally`, but it
kept scalar ignored cleanup returns deferred. TypeScript / JavaScript code
often returns incidental values from `finally` callbacks, and ECMAScript
ignores non-thenable cleanup fulfillment values while preserving the original
source settlement.

## Decision

Accept only primitive ignored cleanup returns for
`Promise<T>.finally(onFinally)`: `number`, `bigint`, `boolean`, `string`,
string literals, and string-literal unions. The chained result remains
`Promise<T>`; cleanup side effects run, the returned primitive is discarded,
and the old void cleanup preservation / override path is reused. Rejected
alternatives: accepting every non-Promise object, probing structural
`PromiseLike` / arbitrary thenables, or treating mixed reference values as
harmless ignored returns all remain out of scope so the future thenable
boundary stays explicit.

## Implementation

- `src/codegen.ts:402` adds the narrow primitive ignored-return predicate,
  including bigint and string-literal unions while excluding references and
  callable / object-like values.
- `src/codegen.ts:11905` widens `inferPromiseFinallyCall` from only `void` or
  `Promise<T>` to `void`, `Promise<T>`, or the primitive ignored-return set,
  with the new diagnostic spelling.
- `src/codegen.ts:12048` keeps Promise-return cleanup forwarding separate,
  keeps the void path unchanged, and emits a typed temporary for primitive
  cleanup returns before discarding it.
- `examples/promise_finally_ignored_return.ts:20` covers fulfilled
  preservation, rejected preservation for string / boolean cleanup returns,
  string-literal-union cleanup, FIFO ordering, and cleanup throw override.
- `examples/promise_finally_non_void_return_fail.ts:3` now pins a plain class
  return as still rejected, while the existing thenable-shaped class fail stays
  rejected.
- `tests/smoke.sh:2973` adds the positive run and `tests/smoke.sh:3048` /
  `tests/smoke.sh:3049` update the reference-return diagnostics.
- `MEMO.md:443` records the 5.50 boundary without reopening optional handler
  normalization, arbitrary thenables, unhandled rejection reporting, or
  scheduler API work.

## Consequences

- **Accepted**: `promise_finally_ignored_return` covers primitive cleanup
  values being evaluated for side effects and discarded while preserving the
  source settlement.
- **Rejected**: class / reference cleanup returns, including a class with a
  `then()` method, still produce the explicit
  `Promise.finally callback must return void, Promise<T>, or an ignored
  primitive value` diagnostic.
- **Regression**: `tests/smoke.sh` now has 486 `run_case` / `run_module_case`
  / `run_fail_case` entries. The positive TypeScript syntax check is
  `pnpm exec tsc --noEmit --skipLibCheck examples/promise_finally_ignored_return.ts`.
- **Scope out**: no `Promise.then` / `.catch` result policy changes, arbitrary
  thenable assimilation, optional non-function handler normalization,
  unhandled rejection reporting, or scheduler API is implemented here.
