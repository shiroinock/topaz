# 0577 - Multi-await binary operator generalization

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.110

## Context

Phases [5.107](./0574-multi-await-binary-initializer.md),
[5.108](./0575-multi-await-binary-return.md), and
[5.109](./0576-multi-await-binary-expression-statement.md) established one
shared direct multi-await binary planner for declaration initializers,
terminal returns, and expression-statement discards. That planner was still
hard-coded to `+`, even though the ordered two-await frame shape is identical
for non-short-circuit operators once the awaited payloads are replaced by temps.

## Decision

Generalize `tryBuildMultiAwaitBinaryExpression` from root `+` only to any root
binary operator except `&&`, `||`, and `??`. Keep the existing shape fence:
the paren-unwrapped root must be binary, both sides must be exactly one direct
`await`, nested awaited subexpressions are deferred, and both awaited payloads
must be non-void. The planner only performs ordered await decomposition and temp
replacement; operator typing and diagnostics remain delegated to the existing
transformed-expression `inferType` / `emitWithExpected` / `binaryOp` paths.

Rejected alternatives: special-casing numeric, string, bigint, comparison, or
equality typing in the async planner would duplicate the existing operator type
checker; accepting `&&`, `||`, or `??` would require branch-sensitive
continuation planning; nested binary trees and arbitrary expression
decomposition remain broader expression-planner work; scheduler, Promise ABI,
PromiseLike, thenable, and runtime task-queue changes are unnecessary.

## Implementation

- `src/codegen.ts:6556` keeps the shared planner on paren-unwrapped root binary
  expressions, but only rejects `&&`, `||`, and `??` at the operator gate.
- `src/codegen.ts:6560` through `src/codegen.ts:6574` preserves the two direct
  awaited operand checks, nested-await rejection, and non-void awaited payload
  requirement.
- `src/codegen.ts:6576` through `src/codegen.ts:6614` continues to declare
  ordered payload temps, replace the two await expressions, and return the same
  two-step plan consumed by initializer, return, and statement positions.
- `examples/async_binary_operator_multiple_await.ts:13` covers initializer
  numeric `*`, terminal return numeric comparison, expression-statement string
  equality, and observable left-wave / right-wave / result / then ordering.
- `examples/await_multiple_deferred_fail.ts:3` now pins a short-circuit
  multi-await binary return as still deferred after direct `*` became accepted.

## Consequences

- **Accepted**: `(await left) * (await right)`, comparisons, strict equality,
  and other non-short-circuit root binary operators in the three previously
  supported top-level async-frame positions when existing operator typing accepts
  the transformed expression.
- **Preserved**: existing `+` behavior, left-to-right suspension order, loose
  equality diagnostics, call-argument fallback behavior, and non-void awaited
  payload checks.
- **Rejected**: `&&`, `||`, `??`, nested/general expression decomposition,
  side-effectful non-await sibling capture, and scheduler/runtime changes.
- **Regression**: `async_binary_operator_multiple_await` proves accepted
  non-`+` operators across initializer, return, and statement positions, while
  `await_multiple_deferred_fail` keeps short-circuit multi-await deferred.
- **Regression count**: smoke now covers 641 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
