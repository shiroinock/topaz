# 0520 - array element compound await

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.53

## Context

ADR [0508](./0508-local-compound-assignment-await.md) accepted local identifier
compound assignment await, ADR
[0509](./0509-class-field-compound-assignment-await.md) accepted concrete class
fields, and ADR [0519](./0519-interface-field-compound-await.md) accepted
interface fields via getter/setter lowering. Array elements remained deferred
because compound assignment could not reuse a C lvalue without evaluating the
array or index more than once.

## Decision

Accept array element compound assignment by evaluating the array receiver once
into a temp, evaluating the index once into a temp, reading the old element
through `topaz_array_<T>_at`, computing the compound result, and writing the
result through `topaz_array_<T>_set`. The async statement-position slice stores
the receiver and index in the async frame before awaiting the RHS, then resumes
through the ordinary array element compound assignment emitter. Rejected
alternatives: async-only array mutation lowering, public reference/proxy
objects, side-effectful receiver or index support, multiple-await expression
decomposition, thenable assimilation, and scheduler changes.

## Implementation

- `src/codegen.ts:161` adds an internal async-frame index temp descriptor.
- `src/codegen.ts:4991` updates the shared await diagnostic to include array
  element compound assignment statements.
- `src/codegen.ts:4999` extends assignment-await transformation so
  `elem_access` targets can restore saved receiver/index temps after resume.
- `src/codegen.ts:5100` validates and declares simple receiver/index temps for
  async array element compound assignment.
- `src/codegen.ts:10647` emits ordinary array element compound assignment via
  one receiver temp, one index temp, one old-value read, one next-value temp,
  and one `topaz_array_<T>_set` call.
- `src/codegen.ts:10972` routes array element compound ops to that helper while
  preserving plain array element assignment.

## Consequences

- **Accepted**: ordinary array element `+=`, `-=`, `*=`, `/=`, `%=` assignment
  and string `+=`.
- **Accepted**: async declarations, arrows, methods, and anonymous async
  function expressions can use top-level array element compound assignment with
  one direct or simple RHS await.
- **Rejected**: side-effectful receivers and indexes require future
  target-reference work; multiple awaits still hit the shared await diagnostic;
  type mismatches still use ordinary assignment diagnostics.
- **Regression**: `async_await_array_element_compound_assignment` covers
  ordinary sync array compound assignment, async declaration / arrow / method /
  anonymous function expression surfaces, numeric ops, string `+=`, simple RHS
  await, and FIFO ordering.
- **Regression**:
  `async_await_array_element_compound_assignment_side_effect_receiver_fail`,
  `async_await_array_element_compound_assignment_side_effect_index_fail`,
  `async_await_array_element_compound_assignment_multiple_fail`, and
  `async_await_array_element_compound_assignment_type_mismatch_fail` pin the
  deferred and error boundaries.
- **Regression count**: smoke now covers 496 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
