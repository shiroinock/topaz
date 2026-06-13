# 0530 - nonrecursive named function expression

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.63

## Context

ADR [0478](./0478-anonymous-function-expression-frontier.md) introduced
`function_expr` with an optional source name, but codegen rejected all named
function expressions because JavaScript gives the name an inner self-binding.
Topaz function values do not expose `.name`, so erasing an unused source name is
not observable in the current subset. The compatibility target is the common
TypeScript spelling where the name is documentation or diagnostic help, not a
recursive binding.

## Decision

Accept named function expressions only when their body does not reference the
source name. The name is not declared in ordinary scope or capture scope; after
the guard passes, named expressions lower through the same anonymous
function-expression path for sync, no-await async, and supported async await
frames.

Rejected alternatives: implementing a self-binding environment would add a new
local binding model and recursive closure shape; resolving the name through the
outer scope would compile the wrong program when an outer binding happens to
exist; adding runtime function names or `.name` would broaden the function value
ABI; simply removing the named-expression reject would miss recursive uses.

## Implementation

- `src/codegen.ts:6787` keeps the existing function-expression support gate but
  now scans a named expression body before lowering.
- `src/codegen.ts:6814` adds a conservative statement/expression scan for
  identifier references to the source name, including nested arrows and nested
  function expressions.
- `src/codegen.ts:6790` reports
  `named function expression self-binding is deferred` when the scan finds such
  a reference.
- `examples/function_expression_named.ts` covers contextual assignment, outer
  capture, and callback argument use for sync named expressions.
- `examples/async_function_expression_named.ts` covers one no-await async named
  expression and one supported await-frame named expression.
- `examples/function_expression_named_deferred_fail.ts` now pins the recursive
  self-reference rejection instead of rejecting all named expressions.
- `tests/smoke.sh:3178` adds the positive sync/async cases and updates the
  focused fail expectation.
- `MEMO.md:456` records the phase 5.63 completion line.

## Consequences

- **Accepted**: nonrecursive named function expressions on the existing sync and
  async function-expression surfaces.
- **Rejected**: any identifier reference to the source name inside the body,
  including nested arrow or nested function-expression references.
- **Preserved**: no recursive self-binding, no runtime function-name surface, no
  function value ABI changes, no scope/capture binding for the source name, and
  no broadening of function-expression `this`, parameter, `arguments`,
  `new.target`, or arbitrary await support.
- **Regression**:
  `function_expression_named`, `async_function_expression_named`, and
  `function_expression_named_deferred_fail` pin this boundary.
- **Regression count**: smoke now covers 549 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
