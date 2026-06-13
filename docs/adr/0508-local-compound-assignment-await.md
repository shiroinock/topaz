# 0508 - Local Compound Assignment Await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.41

## Context

ADR [0503](./0503-assignment-await-statement.md) added statement-position
assignment await for direct RHS awaits, and ADR
[0506](./0506-assignment-rhs-expression-await.md) widened that to the existing
simple RHS expression envelope. Both deliberately deferred compound assignment
because general targets need read/modify/write ordering and target evaluation
preservation across suspension. The next compatibility slice is the pure target
case: local or captured identifiers.

## Decision

Accept only expression statements shaped as identifier compound assignment with
`+=`, `-=`, `*=`, `/=`, or `%=`, where the target contains no await and the RHS
contains the single collected await either directly or inside the existing
simple-expression replacement envelope. The async frame awaits the operand into
the statement temp, replaces the RHS await with that temp, validates the
transformed compound assignment with `inferType(...)`, and emits it through the
ordinary assignment path. Rejected alternatives: property, element, interface
field, and `this.field` compound assignment await still need target-reference
temps; value-position compound assignments would be broader expression
decomposition; multiple awaits and control-flow awaits remain outside the
statement-lowering surface.

## Implementation

- `src/codegen.ts:4969` updates the shared deferred await diagnostic to name
  local identifier compound assignment statement await as the accepted slice.
- `src/codegen.ts:4972` adds the compound-op predicate used by the assignment
  statement await builder.
- `src/codegen.ts:4987` keeps plain `=` assignment behavior unchanged and
  admits only compound assignments whose unwrapped target is an identifier.
- The existing RHS rewrite path still uses `simpleAwaitReplacementSupported(...)`
  and `replaceAwaitExprInExpr(...)`, so simple numeric and string `+=` RHS
  expressions share the phase 5.39 envelope.
- `MEMO.md:434` records phase 5.41 in the async compatibility track.

## Consequences

- **Accepted**: block-bodied async declarations, async arrows, async class
  methods, and anonymous async function expressions can use local identifier
  compound assignment await in statement position.
- **Accepted**: numeric `+=`, `-=`, `*=`, `/=`, `%=` and string `+=` work with
  direct or simple RHS awaits when ordinary assignment type checking accepts the
  transformed expression.
- **Deferred**: `this.field += await p`, `obj.field += await p`,
  `iface.field += await p`, `items[i] += await p`, value-position compound
  assignment, multiple awaits, control-flow await, Promise rejection handlers,
  thenable assimilation, and scheduler work.
- **Regression**: `examples/async_await_local_compound_assignment.ts` covers
  local numeric compound ops, simple RHS `+=`, captured `let` in an anonymous
  async function expression, string `+=`, async arrow, and async method-local
  assignment.
- **Regression**: `examples/async_function_deferred_fail.ts`,
  `examples/async_method_deferred_fail.ts`, and
  `examples/function_expression_async_deferred_fail.ts` keep property,
  `this.field`, and control-flow compound assignment await deferred.
- **Regression count**: the smoke suite now has 468 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
