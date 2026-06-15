# 0615 - Awaited assignment call leaves

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.148

## Context

[0577](./0577-multi-await-binary-operator-generalization.md) and
[0598](./0598-multiple-binary-call-arguments.md) made non-short-circuit binary
call arguments evaluate awaited leaves in source order, but assignment leaves
inside those binaries still fell through to the shared deferred await diagnostic.
The next async compatibility gap was the narrow TS shape
`combine(await p1 + (counter = await p2), await p3)`, where the assignment target
is a local identifier and the RHS contains one supported await.

## Decision

Accept only plain identifier assignment leaves with `op === "="`, no await in
the target, and exactly one RHS await that satisfies the same simple replacement
envelope as assignment-statement await lowering. The ordered call-argument
planner records the assignment leaf as an awaited binary event, awaits the RHS
through the existing async suspension step, materializes the transformed
assignment expression immediately after that await, and replaces the binary leaf
with the materialized value temp. Rejected alternatives: a general expression IR
would be broader than this phase, runtime scheduler/task-queue semantics are not
needed for source-order lowering, PromiseLike/thenable compatibility remains a
separate frontier, and property/element/compound assignment leaves need receiver,
index, setter, or old-value snapshot rules that this phase deliberately leaves
deferred.

## Implementation

- `src/codegen.ts:270` adds the `assign_await` binary leaf event and assignment
  owners for outer and nested call-argument binaries.
- `src/codegen.ts:6040` factors the narrow identifier-assignment leaf builder,
  replaces the RHS await with the awaited temp, and runs `inferType` on the
  transformed assignment expression.
- `src/codegen.ts:6828` and `src/codegen.ts:7075` count assignment leaves as
  awaited binary events while preserving the existing event order.
- `src/codegen.ts:7253` and `src/codegen.ts:7302` materialize the transformed
  assignment leaf after its await and replace the original leaf with the value
  temp in the surrounding binary.
- `src/codegen.ts:8208` recognizes only `identifier = <single supported await>`
  in `collectMultiAwaitCallArgBinaryLeafEvents`; property, element, compound,
  nested-await, and target-await forms return to the deferred boundary.
- `src/codegen.ts:8520` lets the shared await replacer descend through
  assignment expressions so the validated assignment leaf can reuse existing
  expression emit/type paths.

## Consequences

- **Accepted**: non-short-circuit call-argument binaries containing a direct
  awaited leaf, a plain identifier assignment leaf whose RHS awaits once, and
  later direct awaited arguments.
- **Preserved**: source-order awaits, pre-await argument/snapshot stores,
  materialized nested call ordering, ordinary call signature/type validation, and
  the shared async suspension machinery.
- **Rejected**: property assignment, element assignment, compound assignment,
  conditional/logical/nullish assignment, target expressions with await,
  optional/spread forms, nested call roots outside the existing planner,
  PromiseLike/thenable expansion, and runtime scheduler changes.
- **Regression**: `await_call_arg_multiple_deferred_fail` moves from deferred
  fail to positive coverage for awaited identifier assignment leaves;
  `await_call_arg_assignment_property_deferred_fail` pins property assignment
  leaves to the existing deferred await diagnostic.
- **Regression count**: smoke covers 690 `run_case` / `run_module_case` /
  `run_fail_case` entries.
