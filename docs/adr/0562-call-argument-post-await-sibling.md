# 0562 - Call Argument Post-Await Sibling

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.95

## Context

ADR [0559](./0559-call-argument-pre-await-sibling-temp.md) accepted the
`leftSibling + await promise` half of narrow binary call-argument await by
storing the left sibling before suspension. The mirrored
`await promise + rightSibling` shape still failed even though the awaited
operand was direct/simple and the right sibling naturally belongs after the
await resumes.

## Decision

Accept only a non-logical binary call argument where the left side contains the
single collected `await_expr`, the left side is still direct/simple by the
existing call-argument await predicate, and the right side contains no await
while fitting the existing sibling envelope. The resumed argument rewrites only
the awaited node to the awaited temp and leaves the right sibling in place, so
no new async-frame temp is allocated for post-await work. Rejected alternatives:
reusing the pre-await temp path would run the right sibling too early; arbitrary
expression decomposition would require a general scheduler for subexpression
temps; and PromiseLike / thenable assimilation or scheduler behavior remain
separate runtime decisions.

## Implementation

- `src/codegen.ts:5841` falls back from direct/simple replacement to the
  existing pre-await sibling temp builder and then to the new post-await
  sibling builder before using the shared unsupported await diagnostic.
- `src/codegen.ts:6071` recognizes the narrow await-left binary form, rejects
  logical operators and additional awaits, and reuses the existing direct/simple
  await replacement predicate for the left operand.
- `src/codegen.ts:6083` rebuilds the binary argument with only the awaited
  expression replaced by the awaited temp, leaving the right sibling for normal
  continuation emission.
- `examples/async_await_call_arg_post_sibling.ts` covers initializer,
  discard-statement, static-call, receiver-temp method-call, and terminal return
  surfaces while proving the right sibling runs after `sync tail`.
- Existing `_fail` fixtures that used the newly accepted mirror form were
  retargeted to multiple-await or logical/ternary shapes so broad decomposition
  remains pinned to the shared diagnostic.
- `MEMO.md:488` records the 5.95 boundary without changing the broader async
  runtime or scheduler roadmap.

## Consequences

- **Accepted**: descriptor-backed call arguments may now use
  `callee(await promise + rightSibling)` and parenthesized simple-await-left
  variants across initializer, expression statement, and terminal return async
  frame steps.
- **Preserved**: receiver capture and strictly earlier call argument temps still
  run before suspension; the right sibling runs only after the awaited operand
  resumes.
- **Rejected**: logical operators, ternary forms, multiple awaits, multiple
  awaited arguments, awaited receiver plus awaited argument, optional/spread
  calls, general expression decomposition, PromiseLike / thenable assimilation,
  and scheduler/runtime changes remain deferred.
- **Regression**: `async_await_call_arg_post_sibling` covers the accepted
  continuation path, while the retargeted `await_call_arg_*_deferred_fail`
  fixtures keep broader post-await decomposition and multiple-await call
  arguments on the shared unsupported await diagnostic.
- **Regression count**: the smoke suite now has 614 explicit `run_case` /
  `run_module_case` / `run_fail_case` entries.
