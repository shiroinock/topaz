# 0638 - Array/interface postfix update snapshot leaves

- **Status**: Accepted
- **Date**: 2026-07-18
- **Phase**: 5.171

## Context

[0636](./0636-array-interface-prefix-update-leaves.md) added helper-backed prefix
updates for array elements and interface fields, and
[0637](./0637-postfix-local-class-update-leaves.md) accepted postfix updates for
local identifiers and concrete class fields. The remaining safe target families
needed postfix helpers because `values[i]++` and `slot.value++` must yield the
old value while still committing the incremented or decremented state before a
later await resumes.

## Decision

Add narrow helper emission for postfix `++` / `--` on array element and
interface field targets. Each helper evaluates its receiver, and array index
when present, into temporaries, reads the old value through the existing getter
path, computes the next value with the postfix delta, writes it through the
existing setter path, and yields the old value.

The multi-await binary snapshot predicate now accepts postfix update leaves for
the same safe target families as prefix update: local identifiers, safe concrete
class fields, safe interface fields, and safe array elements. Array/interface
postfix snapshots need no resume restore because the helper mutation happens
before suspension and the snapshot temporary carries only the expression's old
value.

Rejected alternatives: target-reference descriptors remain broader than this
helper-backed slice; unsafe receiver/index forms such as `makeSlot().value++`
or `values[nextIndex()]++` still require materialization policy; changing setter
ABIs to return values would churn runtime and vtable contracts unnecessarily.

## Implementation

- `src/codegen.ts:8903` widens postfix `++` / `--` snapshot leaves to include
  safe interface field and array element targets.
- `src/codegen.ts:15239` adds statement-expression helpers that write the next
  value for interface fields and array elements while yielding the old value.
- `src/codegen.ts:15563` routes normal postfix array/interface targets through
  those helpers before falling back to C postfix emission for C-lvalue targets.
- `tests/smoke.sh:3159` and `tests/smoke.sh:3160` promote the array/interface
  postfix fixtures to positive old-value and updated-state regressions, while
  `tests/smoke.sh:3163` and `tests/smoke.sh:3164` pin unsafe index/receiver
  forms to the deferred await-lowering boundary.

## Consequences

- **Accepted**:
  `examples/await_binary_array_element_postfix_update_deferred_fail.ts` and
  `examples/await_binary_interface_postfix_update_deferred_fail.ts` prove both
  normal helper semantics and multi-await snapshot source-order behavior.
- **Rejected**:
  `examples/await_binary_array_element_postfix_update_side_effect_index_deferred_fail.ts`
  and
  `examples/await_binary_interface_postfix_update_side_effect_receiver_deferred_fail.ts`
  continue to require future target-reference decomposition.
- **Regression count**: smoke covers 712 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
- **Scope**: unsafe receiver/index materialization, runtime helpers, scheduler
  work, thenable support, and general expression IR remain out of scope.
