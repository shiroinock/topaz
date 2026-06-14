# 0574 - Multi-await binary initializer

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.107

## Context

Phases 5.101 through 5.106 exhausted the descriptor-backed direct
call-argument and awaited-receiver frontier. The next async compatibility gap is
not another descriptor family but a small piece of general expression
decomposition. Existing declaration-initializer await lowering already supports
multiple suspension steps, frame temps for awaited payloads, and final emission
of a transformed initializer after the last resume.

## Decision

Accept only top-level `const` / `let` declaration initializers whose paren
unwrapped root is binary `+` and whose left and right operands each contain
exactly one direct/simple awaited expression. The planner creates one ordered
initializer suspension step per operand, replaces each awaited operand with a
payload temp, preserves annotated initializer context through the existing
transformed-initializer type check, and emits the binary initializer only after
the right operand resumes.

Rejected alternatives: folding this into the call-argument planner would make
non-call expression decomposition depend on descriptor call machinery; accepting
nested binary trees, logical / nullish / ternary expressions, assignment
expressions, return expressions, expression statements, or side-effectful
non-await siblings would jump past the intended narrow compatibility slice; a
new scheduler or Promise ABI is unnecessary because the existing async frame
and `topaz_promise_then_into` path already preserve ordered suspension.

## Implementation

- `src/codegen.ts:5352` tries the new binary initializer planner before the
  existing multi-await call-argument planner in the declaration-initializer
  multiple-await branch.
- `src/codegen.ts:6542` adds `tryBuildMultiAwaitBinaryInitializerExpression`,
  accepting only root `+` with exactly one direct awaited left operand and one
  direct awaited right operand.
- `src/codegen.ts:6560` resolves both awaited operands, rejects void payloads,
  declares payload temps, and rewrites the initializer through the existing
  await replacement helper.
- `examples/async_await_initializer_binary_multiple.ts` covers async function
  declarations, async arrows, async class methods, anonymous async function
  expressions, `const` and `let` initializers, number `+`, string `+`, and
  observable right-operand evaluation after the first await resumes.
- `examples/await_initializer_multiple_deferred_fail.ts` now pins a nested
  multi-await binary initializer as still deferred.

## Consequences

- **Accepted**: `(await Promise.resolve(a)) + (await Promise.resolve(b))` in
  top-level async-frame declaration initializers when both payloads are
  non-void and the transformed initializer type-checks.
- **Preserved**: left-to-right evaluation order, annotated initializer context,
  existing async frame temps, existing Promise continuation scheduling, and the
  call-argument planner boundary.
- **Rejected**: nested/general expression decomposition, non-`+` operators,
  logical / nullish / ternary shapes, return and expression-statement positions,
  side-effectful non-await sibling temp capture, void awaited operands, and
  scheduler/runtime changes.
- **Regression**: `async_await_initializer_binary_multiple` proves number and
  string binary initializers across async function forms, and
  `await_initializer_multiple_deferred_fail` keeps nested binary decomposition
  outside this phase.
- **Regression count**: smoke now covers 638 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
