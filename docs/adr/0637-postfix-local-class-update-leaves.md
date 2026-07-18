# 0637 - Postfix local/class update snapshot leaves

- **Status**: Accepted
- **Date**: 2026-07-18
- **Phase**: 5.170

## Context

[0635](./0635-prefix-update-snapshot-leaves.md) accepted prefix update snapshot
leaves, and [0636](./0636-array-interface-prefix-update-leaves.md) added the
array/interface helper-backed prefix targets. Postfix update has different value
semantics: `x++` yields the old value, while the target must contain the updated
value before any later await resumes.

## Decision

Accept postfix `++` / `--` snapshot leaves only for local identifiers and safe
concrete class fields. The snapshot temporary carries the postfix expression's
old value. Local identifiers therefore restore their live state after resume
from `old + 1.0` or `old - 1.0`; concrete class fields need no restore because
the heap field mutation already happened before suspension.

Rejected alternatives: accepting array element or interface field postfix in
this phase would require helper-backed read/write policy for separate old-value
yield and new-value setter state; a general target-reference descriptor remains
too broad for this slice; reusing prefix restore behavior for postfix locals
would restore the old value instead of the updated local state.

## Implementation

- `src/codegen.ts:8903` lets `isSnapshotMultiAwaitLeaf` accept postfix `++` and
  `--` leaves when the operand is a local identifier or a safe concrete class
  field target.
- `src/codegen.ts:9609` restores local postfix update snapshots by assigning the
  resumed local from the saved old value plus or minus `1.0`.
- `tests/smoke.sh:3158` promotes the historical local postfix deferred fixture
  to a positive local/class source-order regression.
- `tests/smoke.sh:3159` and `tests/smoke.sh:3160` keep array element and
  interface field postfix update behind the deferred await-lowering boundary.

## Consequences

- **Accepted**:
  `examples/await_binary_postfix_update_side_effect_deferred_fail.ts` proves
  local and concrete class field postfix expressions yield old values while the
  targets hold updated values after the await resumes, returning `442`.
- **Rejected**:
  `examples/await_binary_array_element_postfix_update_deferred_fail.ts` and
  `examples/await_binary_interface_postfix_update_deferred_fail.ts` continue to
  fail with `await expression lowering is deferred`.
- **Regression count**: smoke covers 710 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries in the current script.
- **Scope**: array/interface postfix helpers, unsafe receiver/index
  decomposition, runtime helpers, scheduler work, thenable support, and general
  expression IR remain out of scope.
