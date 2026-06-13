# 0504 - String indexOf await return

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.37

## Context

ADR [0489](./0489-string-number-call-descriptor-await.md) put scalar String
method calls on the descriptor-backed call-argument await frontier, and ADR
[0503](./0503-assignment-await-statement.md) kept expression decomposition
narrow. The remaining deferred return-call sample was
`return "abc".indexOf(await Promise.resolve("b"));`, but the blocker was the
missing `String.prototype.indexOf(search)` surface rather than a new async
frame shape.

## Decision

Accept exactly `string.indexOf(search: string): number` as an ordinary String
method descriptor and lower it to a hidden runtime prelude helper named
`__topaz_string_index_of(s, search)`. The helper performs Topaz's existing
ASCII / byte-oriented scan, returns the first zero-based byte index, returns
`-1` when not found, and returns `0` for an empty search. Rejected
alternatives: adding a bespoke async lowering branch would duplicate the
descriptor path; calling a C substrate helper would move a pure string scan
away from the migrated prelude helper pattern; supporting `fromIndex`, JS
coercion, UTF-16 code units, regexp behavior, or other String methods would
expand the public surface beyond this compatibility phase.

## Implementation

- `src/codegen.ts:12187` adds `indexOf` arity and string-argument validation to
  `resolveStringMethodCallPlan(...)` with `number` return metadata.
- `src/codegen.ts:12370` allows `indexOf` through the existing string
  descriptor-backed call-argument await frontier.
- `src/codegen.ts:12617` emits `String.indexOf` through the hidden
  `__topaz_string_index_of` prelude symbol instead of a special async case.
- `runtime/prelude.ts:499` adds the byte scan helper, and
  `src/runtime_prelude.ts` is regenerated from it.
- `tests/smoke.sh:1897` checks the stable generated helper symbol and stale C
  helper absence.
- `MEMO.md:430` records phase 5.37 and the remaining async / string-method
  boundaries.

## Consequences

- **Accepted**: ordinary String calls can use `indexOf(search)` in value
  positions, and block-bodied async declarations can return
  `receiver.indexOf(await promise)` through the existing descriptor path.
- **Accepted**: found-at-beginning, found-in-middle, first repeated
  occurrence, missing search, and empty search are covered as byte-oriented
  Topaz string behavior.
- **Preserved**: user source still cannot call
  `__topaz_string_index_of(...)` directly, and unsupported String methods
  still reject with `unsupported method`.
- **Deferred**: `fromIndex`, JS coercion, UTF-16 semantics, receiver-side
  await, nested expression decomposition, Promise rejection handlers,
  PromiseLike / thenable assimilation, scheduler/task-queue semantics, and
  top-level await.
- **Regression**: `examples/string_method.ts` covers positive non-async
  `indexOf` behavior, while `examples/string_index_of_arity_fail.ts` and
  `examples/string_index_of_arg_type_fail.ts` pin diagnostics.
- **Regression**: `examples/async_await_string_index_of_return.ts` converts
  the prior `return method(await p)` blocker to positive async coverage, and
  `examples/await_return_expr_deferred_fail.ts` now pins receiver-side await.
- **Regression**: `examples/runtime_prelude_string_index_of_hidden_fail.ts`
  keeps the hidden helper boundary covered.
- **Regression count**: the smoke suite now has 461 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
