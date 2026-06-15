# 0617 - Awaited interface-field assignment call leaves

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.150

## Context

[0615](./0615-awaited-assignment-call-leaves.md) accepted awaited identifier
assignment leaves inside non-short-circuit call-argument binaries, and
[0616](./0616-awaited-class-field-assignment-call-leaves.md) extended the same
ordered planner to concrete class-field assignment leaves. The remaining
assignment leaf boundary was interface fields, where the target reference still
has to be captured before the RHS await but the ordinary vtable setter path is
void-valued.

## Decision

Accept call-argument binary leaves of the form
`iface.field = await expr` when `op === "="`, the target is a property access
with a simple lvalue receiver base, the receiver type is an interface, the
property is a declared interface field, the target contains no await, and the
RHS contains exactly one await that satisfies the existing simple replacement
envelope. The planner snapshots the interface receiver into the existing
pre-await receiver-temp path before suspending on the RHS, then materializes a
post-await value expression that stores the RHS value in a local temp, calls the
interface setter with that value, and returns the value to the surrounding
binary. Rejected alternatives: reusing ordinary `emitExpression(assign)` would
feed a void setter result to the binary, globally making interface assignments
value-returning is broader than this slice, array element assignment needs
receiver plus index snapshot and value-returning set semantics, compound
assignment needs old-value reads and operator policy, and a general expression
IR or scheduler work remains out of scope.

## Implementation

- `src/codegen.ts:173` keeps async materialized temps self-host friendly while
  adding an interface-field assignment materialization descriptor.
- `src/codegen.ts:6072` extends the call-argument assignment-leaf builder to
  validate interface receivers and declared fields, snapshot the receiver, and
  preserve RHS contextual assignment checks.
- `src/codegen.ts:7380` and `src/codegen.ts:7427` route outer and nested
  assignment leaves through the shared materialized-temp descriptor builder.
- `src/codegen.ts:8932` emits the post-await setter-then-value expression for
  interface-field assignment leaves without changing ordinary interface
  assignment expression semantics.
- `examples/await_call_arg_assignment_interface_deferred_fail.ts:43` now proves
  receiver snapshot before RHS await, RHS source order, field mutation, and the
  assigned value contributing to the binary.
- `examples/await_call_arg_assignment_array_element_deferred_fail.ts:16`
  preserves the next assignment boundary at the shared deferred diagnostic.

## Consequences

- **Accepted**: interface-field `receiver.field = await expr` leaves in
  non-short-circuit call-argument binaries under the ordered multi-await
  planner.
- **Preserved**: identifier and class-field behavior, ordinary void-valued
  interface setters, source-order later arguments, and existing diagnostics for
  unsupported assignment targets.
- **Rejected**: array element assignment leaves, compound assignment leaves,
  target expressions containing await, structural thenables, runtime scheduler
  changes, and general expression decomposition.
- **Regression count**: smoke covers 692 `run_case` / `run_module_case` /
  `run_fail_case` entries, including the promoted interface fixture and the new
  array-element deferred fixture.
