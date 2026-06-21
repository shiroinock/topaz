# 0635 - Prefix update snapshot leaves

- **Status**: Accepted
- **Date**: 2026-06-21
- **Phase**: 5.168

## Context

[0631](./0631-local-compound-assignment-snapshot-leaves.md) accepted local
compound assignment snapshot leaves, and
[0632](./0632-class-field-compound-assignment-snapshot-leaves.md) accepted the
concrete class field compound-assignment side. Update expressions are the next
side-effecting expression family, but prefix and postfix have different value
semantics: prefix `++x` yields the updated value, while postfix `x++` yields
the old value and leaves a different value in the target.

## Decision

Only prefix update expressions whose expression value is the updated target
value are accepted as snapshot leaves. Local identifiers and safe concrete
class fields can use the existing single snapshot temporary: locals are restored
from the saved updated value after resume, and class fields rely on the heap
mutation that already happened before suspension.

Rejected alternatives: accepting postfix update would require separate old
expression value and new target value materialization; accepting array element
or interface field update would need helper-based update semantics because
their emitted targets are not simple C lvalues; materializing unsafe receivers
or indexes would broaden this phase into target-reference decomposition.

## Implementation

- `src/codegen.ts:8892` lets `isSnapshotMultiAwaitLeaf` accept prefix `++` and
  `--` leaves when the operand is a local identifier or a safe concrete class
  field target.
- `src/codegen.ts:9595` restores local prefix update snapshots by assigning the
  resumed local binding from the saved updated snapshot temporary.
- `tests/smoke.sh:3156` adds the positive source-order regression for local
  and concrete class field prefix update leaves.
- `tests/smoke.sh:3157` and `tests/smoke.sh:3158` pin postfix update and array
  element prefix update to the deferred await-lowering boundary.

## Consequences

- **Accepted**:
  `examples/await_binary_prefix_update_side_effect_snapshot.ts` proves
  `await Promise.resolve(10) + (++value) + await Promise.resolve(30)` and
  `await Promise.resolve(100) + (++box.value) + await Promise.resolve(300)`
  observe updated values before the second await and return `444`.
- **Rejected**:
  `examples/await_binary_postfix_update_side_effect_deferred_fail.ts` and
  `examples/await_binary_array_element_prefix_update_deferred_fail.ts` continue
  to fail with `await expression lowering is deferred`.
- **Regression count**: smoke covers 709 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
- **Scope**: postfix update, array/interface update helpers, unsafe
  receiver/index decomposition, runtime helpers, scheduler work, thenable
  support, and general expression IR remain out of scope.
