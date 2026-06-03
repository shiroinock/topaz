# 0290 - non-null assertion inner guard cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0289](./0289-optional-local-truthiness-cleanup.md) advanced the self-host probe
to `inferType(non_null)`, where the compiler source still tested a
`TopazType | undefined` local with `!stripped`. Topaz conditions are strict
`boolean`, so optional locals in compiler source need explicit undefined
comparisons. The adjacent non-null expression emitter also relied on
TypeScript's `withoutUndefined(inner)!`, which is not a self-hostable source
pattern even though `inferType` already verifies the operand shape.

## Decision

Keep `e!` language behavior unchanged and rewrite the non-null assertion inner
type guards to explicit `=== undefined` checks. Rejected alternatives: loosening
strict boolean conditions for `T | undefined` was rejected because it would
change a core subset rule; changing runtime behavior, accepted operands, or
diagnostics for `e!` was rejected because this phase is a compiler-source
cleanup; sweeping unrelated `withoutUndefined(...)` call sites was rejected
because optional receiver, coalesce, undefined literal, and coercion paths are
already explicit enough or outside this blocker.

## Implementation

- `src/codegen.ts:7146`: stores the result of `withoutUndefined(inner)` in a
  local without using TypeScript's non-null assertion operator.
- `src/codegen.ts:7147`: raises an internal codegen error if the emitter reaches
  `non_null` without an optional inner type after `inferType`.
- `src/codegen.ts:9907`: rejects invalid non-null assertion operands with
  `stripped === undefined || typeEq(stripped, inner)` instead of optional-value
  truthiness.

## Consequences

- **Accepted**: `e!` on `T | undefined` still narrows to `T` and emits the
  existing runtime sentinel check.
- **Rejected**: `e!` on non-optional values still reports that a
  `T | undefined` operand is required.
- **Rejected**: unsupported optional inner representations still use the
  existing shape check.
- **Regression**: no examples were added because existing
  `non_null_and_coalesce`, `non_null_non_optional_fail`, optional-container,
  and dunion optional smoke cases already cover the behavioral surface;
  `tests/smoke.sh` remains at 282 primary compile/run/fail checks including CLI
  failure checks.
- **Self-host**: the old `src/codegen.ts:9904:12` optional-local truthiness
  blocker is removed; the probe now reaches `src/codegen.ts:10009:19` for a
  separate unsupported switch fall-through cleanup.
- **Scope out**: broader truthiness support, runtime changes for non-null
  assertions, and a whole-file `withoutUndefined(...)` cleanup remain out of
  scope.
