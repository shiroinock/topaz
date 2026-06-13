# 0509 - Class Field Compound Assignment Await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.42

## Context

ADR [0508](./0508-local-compound-assignment-await.md) accepted statement-position
compound assignment await only for local / captured identifiers. Ordinary class
field compound assignment was already supported for safe lvalue bases, while the
older implementation log records interface field compound assignment as
unsupported because it needs getter + setter target-reference design. The next
async compatibility slice is the class-field case: a concrete C lvalue exists,
but the receiver must still be evaluated before suspension.

## Decision

Accept only expression statements shaped as concrete class field compound
assignment with `+=`, `-=`, `*=`, `/=`, or `%=`, a safe receiver base, and one
RHS await inside the existing direct/simple replacement envelope. Before awaiting
the RHS operand, store the receiver in an async-frame temp; on resume, restore it
with the awaited payload temp, replace the target receiver and RHS await with
those identifiers, validate through `inferType(...)`, and emit via the ordinary
assignment path. Rejected alternatives: identifier-only lowering would evaluate
receivers after suspension; interface fields need getter+setter target
references; array elements need base/index/value temps plus setter integration;
value-position, control-flow, multiple-await, rejection-handler, thenable, and
scheduler work remain deferred.

## Implementation

- `src/codegen.ts:4797` threads assignment-await receiver temps into statement
  suspension steps so the existing async frame store/restore path can reuse them.
- `src/codegen.ts:4969` updates the shared deferred await diagnostic to name
  local identifier or class field compound assignment statement await.
- `src/codegen.ts:4977` widens the assignment-await builder from identifier
  compound targets to class-field targets that pass ordinary assignment checks.
- `src/codegen.ts:5039` adds the receiver-temp helper: it verifies a concrete
  class receiver/field, declares `__topaz_assign_recv_<n>`, and leaves
  interface / non-class properties deferred.
- `src/codegen.ts:5561` and `src/codegen.ts:5897` already store and restore
  pre-await receiver temps for statement steps, so no runtime change is needed.
- `MEMO.md:435` records phase 5.42 in the async compatibility track.

## Consequences

- **Accepted**: block-bodied async declarations, async arrows, async methods,
  and anonymous async function expressions can use top-level class field
  compound assignment await.
- **Accepted**: numeric `+=`, `-=`, `*=`, `/=`, `%=` and string `+=` on class
  fields with direct or simple RHS awaits.
- **Deferred**: interface field compound assignment await, array element
  compound assignment await, side-effectful receivers, value-position compound
  assignment, nested control-flow await, multiple awaits, Promise rejection
  handlers, thenable assimilation, and scheduler work.
- **Regression**: `examples/async_await_class_field_compound_assignment.ts`
  covers `this.field`, object field, simple RHS `+=`, numeric non-`+=`, string
  `+=`, arrow, method, and anonymous async function expression paths.
- **Regression**: `examples/async_function_deferred_fail.ts`,
  `examples/async_method_deferred_fail.ts`,
  `examples/function_expression_async_deferred_fail.ts`, and
  `examples/async_await_class_field_compound_assignment_side_effect_receiver_fail.ts`
  keep interface, array, control-flow, and side-effectful receiver boundaries
  explicit.
- **Regression count**: the smoke suite now has 470 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
