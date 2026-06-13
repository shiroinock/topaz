# 0506 - Assignment RHS Expression Await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.39

## Context

ADR [0503](./0503-assignment-await-statement.md) added top-level assignment
statement await lowering for `target = await promise;`, but deliberately left
`target = 1 + await promise;` deferred to avoid opening general expression
decomposition. ADRs [0482](./0482-terminal-return-expression-await-lowering.md)
and [0483](./0483-initializer-expression-await-lowering.md) already define a
narrow simple-expression await replacement surface for unary, non-null, paren,
`typeof`, and binary expressions. The next compatibility slice is to reuse that
same replacement boundary for assignment statement RHS values only.

## Decision

Accept only expression statements shaped as plain `target = rhs`, where the
target contains no await, the operator is exactly `=`, and the RHS contains the
single collected `await_expr` inside the existing
`simpleAwaitReplacementSupported(...)` envelope. The async frame stores the
awaited payload in the statement temp, rewrites only the RHS await to that temp,
and validates the transformed assignment with `inferType(...)` before emission.
Rejected alternatives: compound assignments would need read/modify/write and
target evaluation rules; pre-evaluating target references would change the 5.36
resume-time target model; and supporting calls, property/index reads, logicals,
conditionals, or object/array literals would become a broad nested expression
decomposition phase.

## Implementation

- `src/codegen.ts:4969` clarifies the deferred await diagnostic to mention
  direct/simple RHS assignment statement await.
- `src/codegen.ts:4986` extends
  `tryBuildAssignmentAwaitStatementExpression(...)` so plain assignment
  statements use `simpleAwaitReplacementSupported(...)` and
  `replaceAwaitExprInExpr(...)` on the RHS instead of requiring the whole RHS to
  be the direct `await_expr`.
- The async frame statement machinery remains unchanged: the awaited payload
  temp is stored in the frame, restored in the continuation, and the transformed
  assignment is emitted through the ordinary assignment path.
- `MEMO.md:432` records phase 5.39 in the async compatibility track.

## Consequences

- **Accepted**: block-bodied async declarations, anonymous async function
  expressions, and class async methods can assign from simple RHS expression
  awaits.
- **Accepted**: assignment targets stay on the existing identifier, array
  element, class field, interface field, and safe property-base surface.
- **Preserved**: target evaluation happens after resumption via the existing
  assignment emitter, matching ADR 0503.
- **Deferred**: compound assignment, await in the target, calls or method calls
  inside the RHS, object/array literals, ternary/logical expressions, property
  or index reads with awaited subexpressions, multiple awaits, control-flow
  await, Promise rejection handlers, thenable assimilation, and scheduler work.
- **Regression**: `examples/async_await_assignment_rhs_expression.ts` covers a
  local numeric binary RHS, captured `let` in an anonymous async function
  expression, class field assignment, and string concatenation.
- **Regression**: `examples/function_expression_async_deferred_fail.ts` now
  pins compound assignment await for async function expressions, while
  `examples/await_expression_statement_deferred_fail.ts` keeps nested
  call-argument expression await deferred.
- **Regression count**: the smoke suite now has 463 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
