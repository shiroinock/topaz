# 0616 - Awaited class-field assignment call leaves

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.149

## Context

[0615](./0615-awaited-assignment-call-leaves.md) accepted awaited assignment
leaves inside non-short-circuit call-argument binaries only when the assignment
target was a plain identifier. The remaining source-order gap was concrete
class-field assignment, for example
`combine(await p1 + (box.value = await p2), await p3)`, where the target
reference must be evaluated before the RHS await but the assignment value still
has to feed the surrounding binary after the await resumes.

## Decision

Extend the call-argument assignment-leaf builder from identifier targets to
concrete class-field property targets with `op === "="`, a simple lvalue
receiver base, no await in the target, and exactly one RHS await that satisfies
the existing simple await replacement envelope. Class-field leaves snapshot the
receiver into the same async-frame pre-await receiver temp path used by awaited
method calls, rewrite the target to that temp after resume, materialize the
assignment expression after the RHS await, and replace the original binary leaf
with the materialized value temp. Rejected alternatives: skipping the receiver
temp would evaluate the target after the await, interface fields remain deferred
because their setter path is void-valued, array elements need a separate
value-returning set rule, compound property assignment needs old-value read and
snapshot policy, and a general expression IR or scheduler work is broader than
this phase.

## Implementation

- `src/codegen.ts:6040` renames the identifier-only helper to a narrow
  assignment-leaf builder, preserves identifier assignment, and adds concrete
  class-field target validation.
- `src/codegen.ts:6060` allocates a pre-await receiver temp for accepted
  class-field targets and rewrites the post-await property target to use it.
- `src/codegen.ts:7293` and `src/codegen.ts:7343` attach the returned receiver
  temp to the same planned await step that awaits the assignment RHS, then
  materialize the transformed assignment value.
- `src/codegen.ts:8250` lets call-argument binary collection recognize property
  assignment leaves only inside the existing call-argument planner envelope.
- `examples/await_call_arg_assignment_property_deferred_fail.ts:32` now proves
  receiver snapshot before RHS await, RHS source order, field mutation, and the
  assigned value contributing to the surrounding binary.
- `examples/await_call_arg_assignment_interface_deferred_fail.ts:3` preserves
  the interface-field boundary at the shared deferred await diagnostic.
- `tests/smoke.sh:3121` moves the property fixture to `run_case`, and
  `tests/smoke.sh:3122` adds the new interface-field `run_fail_case`.

## Consequences

- **Accepted**: non-short-circuit call-argument binaries containing concrete
  class-field `receiver.field = await expr` leaves under the same ordered
  multi-await planner as direct await and identifier assignment leaves.
- **Preserved**: identifier assignment behavior, later argument ordering,
  receiver pre-await storage, post-await materialization, and the shared
  deferred diagnostic for unsupported assignment targets.
- **Rejected**: interface fields, array element assignments, compound
  assignments, target expressions containing await, structural thenables,
  runtime scheduler changes, and general expression decomposition.
- **Regression count**: smoke covers 691 `run_case` / `run_module_case` /
  `run_fail_case` entries.
