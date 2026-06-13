# 0519 - interface field compound await

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.52

## Context

ADR [0508](./0508-local-compound-assignment-await.md) accepted local identifier
compound assignment await, and ADR
[0509](./0509-class-field-compound-assignment-await.md) extended the same
statement-position await lowering to concrete class fields. Interface fields
remained deferred because they are not C lvalues: reads and writes go through
the existing interface vtable getter/setter ABI.

## Decision

Accept interface field compound assignment by evaluating the interface receiver
once into a fat-pointer temp, reading the old field value through
`vt->get_<field>`, computing the ordinary compound result, and writing it back
through `vt->set_<field>`. The async statement-position slice reuses the phase
5.42 receiver-temp frame machinery for interface receivers, so
`iface.field += await p` stores the receiver before suspension and emits the
ordinary interface compound assignment after resumption. Rejected alternatives:
async-only setter lowering, evaluating the receiver after suspension, public
field-reference runtime objects, array element compound await, multiple-await
expression decomposition, thenable assimilation, and scheduler changes.

## Implementation

- `src/codegen.ts:4981` updates the shared await diagnostic to include
  interface field compound assignment statements.
- `src/codegen.ts:5005` generalizes the compound-assignment receiver-temp helper
  so safe property receivers may be concrete class fields or interface fields.
- `src/codegen.ts:10521` adds interface compound assignment emission through
  one receiver temp, one getter read, one computed next value, and one setter
  call.
- `src/codegen.ts:10884` routes interface field compound ops to that helper
  while preserving plain interface setter assignment behavior.
- `MEMO.md:445` records phase 5.52 and keeps array element, side-effectful
  receiver, multiple-await, PromiseLike, thenable, and scheduler work deferred.

## Consequences

- **Accepted**: ordinary interface `+=`, `-=`, `*=`, `/=`, `%=` field
  assignment and string `+=` now work through the existing vtable ABI.
- **Accepted**: async declarations, arrows, methods, and anonymous async
  function expressions can use top-level interface field compound assignment
  with one direct or simple RHS await.
- **Rejected**: side-effectful interface receivers still require a simple base;
  multiple awaits in one RHS still hit the shared await diagnostic; type
  mismatches still use ordinary assignment diagnostics.
- **Regression**: `async_await_interface_field_compound_assignment` covers
  ordinary sync interface compound assignment, async declaration / arrow /
  method / anonymous function expression surfaces, numeric ops, string `+=`,
  simple RHS await, and FIFO ordering.
- **Regression**:
  `async_await_interface_field_compound_assignment_side_effect_receiver_fail`,
  `async_await_interface_field_compound_assignment_multiple_fail`, and
  `async_await_interface_field_compound_assignment_type_mismatch_fail` pin the
  deferred and error boundaries.
- **Regression count**: smoke now covers 491 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
