# 0636 - Array/interface prefix update snapshot leaves

- **Status**: Accepted
- **Date**: 2026-07-18
- **Phase**: 5.169

## Context

[0635](./0635-prefix-update-snapshot-leaves.md) accepted prefix update snapshot
leaves only for local identifiers and concrete class fields. Array elements and
interface fields were left out because their read/write paths are helper calls,
not C lvalues: arrays use `topaz_array_*_at` / `topaz_array_*_set`, and
interface fields use vtable getters/setters.

## Decision

Add narrow helper emission for prefix `++` / `--` on array element and
interface field targets. Each helper evaluates the receiver, and the array index
when present, into temporaries, reads the old value, computes the updated value,
writes through the existing setter path, and yields that updated value.

Safe array/interface prefix update expressions are then allowed as multi-await
snapshot leaves behind the same safe receiver/index predicates already used by
assignment snapshot leaves. They need no resume restore because the mutation
happens before the next suspension and the snapshot temporary carries the
expression value.

Rejected alternatives: postfix update still needs a separate old-value versus
new-target-state snapshot policy; a general target-reference abstraction remains
too broad for one phase; changing array or interface setter ABIs to return the
assigned value would churn runtime and vtable contracts without adding coverage.

## Implementation

- `src/codegen.ts:8870` widens `isSnapshotMultiAwaitLeaf` so prefix `++` / `--`
  accepts local identifiers, safe concrete class fields, safe interface fields,
  and safe array element targets.
- `src/codegen.ts:15176` adds statement-expression helpers for prefix update on
  array element and interface field targets.
- `src/codegen.ts:15474` routes prefix array/interface targets through those
  helpers before falling back to ordinary C prefix emission, and keeps
  array/interface postfix update as a narrow unsupported case.
- `tests/smoke.sh:3157` adds the positive array/interface prefix update snapshot
  regression, and `tests/smoke.sh:3159` / `tests/smoke.sh:3160` pin unsafe
  index/receiver forms to the deferred await-lowering boundary.

## Consequences

- **Accepted**:
  `examples/await_binary_array_interface_prefix_update_snapshot.ts` proves
  normal helper value semantics and multi-await source-order behavior for
  `++values[i]` and `--slot.value`.
- **Rejected**:
  `examples/await_binary_array_element_prefix_update_side_effect_index_deferred_fail.ts`
  and
  `examples/await_binary_interface_prefix_update_side_effect_receiver_deferred_fail.ts`
  continue to require future target-reference decomposition.
- **Regression count**: smoke covers 711 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
- **Scope**: postfix update, unsafe receiver/index materialization, runtime
  helpers, scheduler work, thenable support, and general expression IR remain
  out of scope.
