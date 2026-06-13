# 0491 - call-expression statement await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.24

## Context

ADR [0490](./0490-expression-statement-await.md) added the first
value-discarding statement suspension step for direct `await Promise<T>;`.
ADRs [0487](./0487-call-lowering-descriptor-frontier.md) through
[0489](./0489-string-number-call-descriptor-await.md) already route ordinary,
collection, String, and Number receiver calls through descriptor-backed
call-argument decomposition for declaration initializers and terminal returns.
The next non-terminal await frontier is therefore a call expression used as a
statement, where the awaited payload feeds one direct argument and the call
result is discarded.

## Decision

Accept exactly top-level expression statements whose expression unwraps to a
descriptor-backed `call_expr` with one direct argument that unwraps to the
single `await_expr`. Lower them as an extension of the 5.23 value-discarding
statement step: store descriptor receiver temps and arguments to the left of
the awaited argument before suspension, await the Promise operand, then restore
those temps plus the awaited payload temp and emit the transformed call as a
statement on resume. Rejected alternatives: assignment await and general
expression decomposition stay deferred because they require broader local
capture and expression sequencing; synthetic namespace / builtin descriptor
work remains separate so this phase does not create ad hoc one-off builtin
lowering; Promise / thenable compatibility and scheduler work stay outside the
descriptor call frontier.

## Implementation

- `src/codegen.ts:177` widens `AwaitStatementInfo` with an optional
  transformed expression plus receiver / pre-argument temp metadata, awaited
  payload type, and payload temp name.
- `src/codegen.ts:4679` keeps direct awaited expression statements on the
  no-payload path and recognizes one-await call-expression statements by
  reusing `tryBuildCallArgAwaitExpression(...)`.
- `src/codegen.ts:5212` stores statement receiver and pre-await argument temps
  through the same helper used by initializer and return call-argument await.
- `src/codegen.ts:5297` adds frame fields only for transformed call statements,
  preserving direct `await Promise<T>;` as a value-discarding no-payload step.
- `src/codegen.ts:5371` restores the awaited payload into the statement temp
  when a transformed statement resumes.
- `src/codegen.ts:5521` restores receiver / pre-argument temps, emits the
  transformed call as a statement, and discards its result before continuing
  with the following statement segment.

## Consequences

- **Accepted**: block-bodied async function declarations, async arrows, async
  methods, and anonymous async function expressions can now use one direct
  call-argument `await` in descriptor-backed call statements.
- **Accepted**: `Map.set(await key, value);` and `Set.add(await value);` work
  as statements because the call result is discarded.
- **Preserved**: `Map.set(...)` / `Set.add(...)` in value position still return
  void in this dialect and remain rejected by the existing value-use
  diagnostic.
- **Regression**: `examples/async_await_call_statement.ts` covers declarations,
  fn-typed value calls, class and interface methods, Map / Set statement calls,
  a String receiver method, ordering, and `.then` observers; the smoke suite now
  has 441 explicit run entries.
- **Regression**: `examples/await_expression_statement_deferred_fail.ts` now
  pins nested call-statement await (`foo(1 + await p)`) on the shared
  unsupported await diagnostic, while
  `examples/async_function_deferred_fail.ts`,
  `examples/async_method_deferred_fail.ts`, and
  `examples/function_expression_async_deferred_fail.ts` pin assignment await and
  `examples/await_call_arg_collection_void_deferred_fail.ts` continues to pin
  collection void calls as invalid value expressions.
- **Scope outside**: assignment await, multiple awaits, optional / element /
  constructor calls, Array methods, Promise methods, synthetic namespaces,
  control-flow / try/catch/finally await, non-terminal `return await`, general
  local capture, PromiseLike / thenable assimilation, and scheduler mode remain
  deferred.
