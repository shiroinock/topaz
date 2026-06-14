# 0579 - Multi-await array literals

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.112

## Context

Phases [5.107](./0574-multi-await-binary-initializer.md) through
[5.111](./0578-nested-multi-await-binary-tree.md) established a shared ordered
multi-await planner for declaration initializers, terminal returns, and
expression-statement discards. The next self-hosting-compatible expression shape
is a root array literal whose elements are direct awaited payloads. This shape
needs the same source-order suspension plan, but array typing and contextual
expected type handling should remain in the existing array literal emitter.

## Decision

Add `tryBuildMultiAwaitArrayLiteralExpression` beside the binary planner and
try it before call-argument decomposition in the three existing async-frame
positions. The planner accepts only a paren-unwrapped root `array_lit` whose
normal elements all unwrap to direct/simple `await` expressions. It resolves
await operands left to right, rejects void payloads, declares
`<tempPrefix>_0`, `<tempPrefix>_1`, ... temps, replaces each awaited element
with its temp, and delegates element typing to the transformed array literal.

Rejected alternatives: accepting spreads would need snapshot/reserve planning
across suspension boundaries; mixed non-await siblings would need side-effect
capture; nested arrays, object literals, ternary/logical expressions,
assignments, updates, and `new` are arbitrary decomposition rather than this
direct array shape; special-casing array element typing in the async planner
would duplicate existing contextual array checks.

## Implementation

- `src/codegen.ts:5358`, `src/codegen.ts:5529`, and `src/codegen.ts:5626`
  route initializer, expression-statement, and terminal-return multi-await
  fallback through the array literal planner after binary trees and before
  call-argument decomposition.
- `src/codegen.ts:6601` builds the ordered suspension plan and temp-replaced
  array literal while reusing `MultiAwaitCallArgPlan`.
- `src/codegen.ts:6637` defines the array fence: no empty arrays, no spreads,
  every element must be a direct/simple await, and awaited operands may not
  contain nested awaits.
- `src/codegen.ts:6908` lets `replaceAwaitExprInExpr` rebuild array literals
  so transformed element temps reach the normal array literal type path.
- `examples/async_array_literal_multiple_await.ts:8` covers declaration
  initializer, terminal return, and expression-statement discard arrays with
  observable source-order await operands and FIFO continuation order.

## Consequences

- **Accepted**: direct multi-await array literals in the three existing
  top-level async-frame expression positions.
- **Preserved**: contextual `Array<T>` typing, array monomorph recording,
  non-void awaited payload checks, async-frame completion, and the existing
  scheduler/runtime.
- **Rejected**: spread elements, mixed non-await elements, nested array
  literals, side-effectful siblings, arbitrary expression decomposition,
  Promise ABI changes, thenable assimilation, and scheduler work.
- **Regression**: `async_array_literal_multiple_await` proves the accepted
  shape; `await_initializer_multiple_deferred_fail` pins array spread
  decomposition; `await_return_expr_deferred_fail` pins nested array literal
  decomposition.
- **Regression count**: smoke now covers 643 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
