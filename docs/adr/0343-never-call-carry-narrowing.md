# 0343 - never-call carry narrowing

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.15

## Context

After [0342](./0342-array-push-spread-arguments.md), the self-host probe
advanced to `src/codegen.ts:5885:32`, where `catchClauseMaybe` was checked for
`undefined` and the missing case called `throwInternalCodegenError(...)`.
Topaz already carries `if (x === undefined) return/throw` narrowing into the
following statements, but did not treat a statement call to a known
never-returning helper as an exiting branch.

## Decision

Recognize statement-level exits for direct calls to non-generic top-level
functions whose source return annotation is syntactic `never`, and for
synthetic `process.exit(...)`. This keeps the existing `never` value
representation unchanged: `typeFromAnnotation("never")` still lowers to
`T_VOID`, and never-returning calls remain valid as statements only. Rejected
alternatives: rewriting the compiler source around the blocker was rejected
because the subset should accept the ordinary TypeScript guard idiom; treating
all `void` calls as exits was rejected as unsound; adding a full `never`
TopazType was rejected as broader than this statement-flow need; method,
arrow, and generic never-call flow analysis remains out of scope.

## Implementation

- `src/codegen.ts:1019` adds a `returnsNever` bit to `TopLevelFunctionSig`.
- `src/codegen.ts:1028` adds `typeNodeIsNever` for the raw return annotation
  shape `{ kind: "type_ref", name: "never", typeArgs: [] }`.
- `src/codegen.ts:2267` populates `returnsNever` while collecting non-generic
  top-level function signatures.
- `src/codegen.ts:5373` lets `alwaysExits` ask expression statements whether
  they are known exits.
- `src/codegen.ts:5392` recognizes only direct identifier calls resolved by
  `resolveFunctionSig`, plus syntactic `process.exit(...)`.
- `tests/smoke.sh:401` registers the positive carry case and normal-void
  rejection.

## Consequences

- **Accepted**: `if (x === undefined) { fail(...); }` narrows `x` after the
  guard when `fail` is a non-generic top-level `: never` function.
- **Accepted**: the inverted branch form carries the true-branch narrowing when
  the `else` branch exits, and `process.exit(...)` carries the same narrowing.
- **Rejected**: normal `void` helpers do not carry narrowing; never-returning
  function calls still cannot be used as values.
- **Rejected**: method calls, arrow calls typed as `() => never`, and generic
  function calls are not exit evidence in this phase.
- **Regression**: `examples/never_call_carry_narrow.ts`,
  `examples/never_call_carry_narrow_void_fail.ts`, and the existing
  `examples/never_call_value_fail.ts`.
- **Current blocker**: `pnpm run test:selfhost` now advances to
  `src/codegen.ts:6064:39`, where `currentReturnTypeMaybe` still carries
  `undefined` into `cTypeName(currentReturnTypeMaybe)`.
