# 0578 - Nested multi-await binary tree

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.111

## Context

Phases [5.107](./0574-multi-await-binary-initializer.md),
[5.108](./0575-multi-await-binary-return.md),
[5.109](./0576-multi-await-binary-expression-statement.md), and
[5.110](./0577-multi-await-binary-operator-generalization.md) established one
shared ordered multi-await binary planner for declaration initializers,
terminal returns, and expression-statement discards. That planner still
accepted only a direct two-leaf binary expression, so common parenthesized
arithmetic and comparison trees with three or more awaited leaves remained
deferred even though their suspension order is still source-order leaf order.

## Decision

Extend `tryBuildMultiAwaitBinaryExpression` to recursively recognize
paren-unwrapped binary trees whose internal nodes are non-short-circuit
`bin_op` expressions and whose leaves are direct/simple `await` expressions.
Collect the awaited leaves in source order, resolve each operand independently,
declare temps as `<tempPrefix>_0`, `<tempPrefix>_1`, ..., and replace all
awaited leaves in one transformed expression. Operator typing continues through
the existing transformed-expression path.

Rejected alternatives: accepting `&&`, `||`, or `??` would require
branch-sensitive continuation planning because the right side may not run;
accepting arbitrary expression decomposition or side-effectful non-await
siblings would require broader side-effect capture; special-casing operator
typing in the async planner would duplicate existing binary diagnostics; runtime,
scheduler, Promise ABI, thenable, and PromiseLike changes are unnecessary.

## Implementation

- `src/codegen.ts:6552` keeps the shared planner entry point used by
  initializer, return, and expression-statement positions, but now delegates
  shape recognition to recursive tree collection.
- `src/codegen.ts:6563` resolves each awaited leaf in collected source order,
  rejects void payloads, declares ordered temps, and replaces each leaf in the
  transformed expression.
- `src/codegen.ts:6588` defines the tree fence: leaves must be direct await
  expressions, internal nodes must be `bin_op`, and `&&` / `||` / `??` are
  rejected.
- `examples/async_binary_tree_multiple_await.ts:8` covers declaration
  initializer, terminal return, and expression-statement discard trees in one
  sample with observable left-to-right leaf ordering.
- `examples/await_initializer_multiple_deferred_fail.ts:4` and
  `examples/await_return_expr_deferred_fail.ts:4` now pin non-binary array
  literal multi-await decomposition as still deferred after nested binary trees
  became accepted.

## Consequences

- **Accepted**: nested non-short-circuit binary trees made only of direct awaited
  leaves in the three shared async-frame positions.
- **Preserved**: transformed binary expression typing, non-void awaited payload
  checks, temp naming order, call-argument fallback behavior, and the existing
  scheduler/runtime.
- **Rejected**: short-circuit `&&` / `||` / `??`, non-binary arbitrary
  decomposition, side-effectful non-await siblings, nested awaited operands, and
  PromiseLike / thenable broadening.
- **Regression**: `async_binary_tree_multiple_await` proves the accepted tree
  shape; `await_multiple_deferred_fail` remains pinned on short-circuit binary;
  `await_expression_statement_deferred_fail` remains pinned on a side-effectful
  call-argument sibling; initializer and return deferred samples now cover
  non-binary multi-await arrays.
- **Regression count**: smoke now covers 648 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
