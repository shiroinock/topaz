# 0503 - Assignment await statement

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.36

## Context

ADR [0491](./0491-call-expression-statement-await.md) added ordered async
frame support for statement-position awaits, and ADR
[0502](./0502-promise-resolve-call-descriptor-await.md) kept broad
expression decomposition out of scope. A remaining self-host compatibility
shape was a plain assignment statement whose right-hand side is exactly one
direct `await`, such as `saved = await Promise.resolve(1);`.

## Decision

Accept only expression statements shaped as `assign_expr` with `op === "="`
where the assignment value, after parentheses, is the collected direct
`await_expr`. The scanner replaces that RHS with the existing awaited temp
identifier and then type-checks the transformed assignment through the normal
assignment path, so target validation, const reassignment, array element
mutation, class/interface property mutation, and expected-type coercion stay
centralized. Rejected alternatives: extending `replaceAwaitExprInExpr(...)`
would make assignment awaits accidentally valid in return or initializer
expressions; decomposing `x = 1 + await p` would start a general expression
lowering phase; compound assignments would need a distinct target evaluation
and read/modify/write design.

## Implementation

- `src/codegen.ts:193` adds async local capture metadata so ordinary local
  `let` / `const` declarations before or between ordered awaits can be stored
  in the frame.
- `src/codegen.ts:4731` records non-await local declarations during async
  frame scanning, making `let saved = 0; saved = await ...;` type-check before
  the first suspension.
- `src/codegen.ts:4792` routes expression-statement awaits through the
  assignment builder before falling back to call-argument await lowering.
- `src/codegen.ts:4957` recognizes only the direct RHS assignment shape,
  rejects LHS awaits, and validates the transformed assignment with
  `inferType(...)`.
- `src/codegen.ts:5337` and `src/codegen.ts:5732` save captured locals before
  first and subsequent suspension points, while the continuation runner
  restores them before emitting resumed statements.
- `src/codegen.ts:15378` lets captured `let` identifiers participate in the
  existing assignment target surface, while captured `const` still rejects.
- `MEMO.md:429` records phase 5.36 and the still-deferred nested/compound
  assignment and Promise/runtime boundaries.

## Consequences

- **Accepted**: block-bodied async declarations, arrows, class methods, and
  anonymous async function expressions can use `target = await promise;` as a
  top-level statement.
- **Accepted**: assignment targets stay limited to identifiers, array
  elements, class fields, interface fields, and the safe property bases already
  accepted by `checkAssignTarget(...)`.
- **Preserved**: statements before the await execute synchronously before
  suspension; the assignment target is evaluated on resume by the existing
  assignment emitter; following statements execute after the resumed
  assignment.
- **Deferred**: compound assignment, LHS await, nested RHS awaits such as
  `x = 1 + await p`, assignment await in value positions, control-flow await,
  rejection handlers, PromiseLike / thenable assimilation, scheduler work, and
  top-level await.
- **Regression**: `examples/async_await_assignment_statement.ts` covers local
  `let`, `this.field`, captured `let` in an anonymous async function
  expression, and array element assignment.
- **Regression**: `examples/async_function_deferred_fail.ts`,
  `examples/async_method_deferred_fail.ts`, and
  `examples/function_expression_async_deferred_fail.ts` pin compound or nested
  assignment await as still deferred.
- **Regression count**: the smoke suite now has 459 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
