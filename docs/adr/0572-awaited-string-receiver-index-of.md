# 0572 - Awaited String receiver indexOf

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.105

## Context

ADR [0504](./0504-string-index-of-await-return.md) added the
descriptor-backed `String.prototype.indexOf(search: string): number` surface
and accepted direct awaited search arguments for synchronous receivers. ADR
[0570](./0570-awaited-receiver-method-arguments.md) and ADR
[0571](./0571-awaited-array-receiver-callback-arguments.md) then proved that
the ordered multi-await call plan can schedule a direct awaited receiver before
direct awaited arguments without a separate async emitter.

## Decision

Accept non-optional `String.indexOf` calls in supported async-frame positions
when the receiver is a direct parenthesized `await` resolving to
`Promise<string>` and the single search argument is a direct awaited expression.
The shared ordered call plan schedules the receiver await first, rewrites the
callee to the receiver payload temp, schedules the search await second, and
then emits the existing synchronous String descriptor exactly once.

Rejected alternatives: adding a String-specific async emitter would duplicate
the existing descriptor metadata and prelude helper call; accepting other
String methods or `fromIndex` would widen beyond the fixed scalar target; nested
awaited search expressions, optional/spread calls, Number/collection/Promise
descriptors, PromiseLike / thenable expansion, and scheduler work remain out of
scope.

## Implementation

- `src/codegen.ts:6407` keeps receiver-await multi-await calls on the shared
  ordered planner while adding only the `string_method` plan for `indexOf`
  beside the existing class/interface and Array callback allowances.
- `src/codegen.ts:6307` and `src/codegen.ts:6360` continue to create the
  receiver payload temp and require at least one direct awaited argument when a
  receiver await is present.
- `src/codegen.ts:14739` and `src/codegen.ts:15182` continue to resolve and
  emit `String.indexOf` through the ordinary descriptor and hidden
  `__topaz_string_index_of` prelude helper.
- `examples/async_await_string_receiver_index_of.ts` covers initializer,
  terminal return, expression-statement discard, async arrow, async method, and
  anonymous async function expression positions.
- `examples/await_return_expr_deferred_fail.ts` now pins the remaining nested
  awaited search expression boundary.

## Consequences

- **Accepted**: `(await textPromise()).indexOf(await needlePromise())` in
  top-level async-frame initializers, discard statements, and terminal returns.
- **Preserved**: synchronous-receiver `text.indexOf(await needle)`,
  receiver-only method await, FIFO continuation order, and runtime scheduler
  code.
- **Rejected**: String methods other than `indexOf`, `fromIndex`, nested
  awaited search expressions such as `(await text).indexOf(wrap(await needle))`,
  multiple awaited arguments, optional/spread calls, Number / Array / Map / Set
  / Promise / synthetic descriptor receiver awaits, PromiseLike / thenable
  expansion, and async scheduler changes.
- **Regression**: `async_await_string_receiver_index_of` proves receiver work
  before `sync tail`, search wait after receiver resume, and final `indexOf`
  results after the search argument resumes. The retargeted
  `await_return_expr_deferred_fail` keeps the nested string search boundary.
- **Regression count**: smoke now covers 641 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
