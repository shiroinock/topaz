# 0269 - function signature optional presence cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0268](./0268-function-identifier-diagnostic-anchors.md) advanced the
self-host probe to `src/codegen.ts:8112:11`. The reached blocker was direct
function signature lookup: `resolveFunctionSig` returns
`TopLevelFunctionSig | undefined`, but the emit and infer paths still tested
presence with optional-object truthiness. Topaz conditions are strict boolean,
so the compiler source must spell this absence check explicitly.

## Decision

Preserve function resolution behavior and test function-signature presence with
`sig !== undefined` at the emit-side direct call path, the infer-side
identifier-as-function-value path, and the infer-side direct call path.
Rejected alternatives: adding object/undefined truthiness to conditions was
rejected because it violates the strict boolean subset; returning a sentinel
object from `resolveFunctionSig` was rejected because `undefined` is the
existing absence signal; sweeping unrelated optional checks was rejected as
broader than this function-signature lookup blocker.

## Implementation

- `src/codegen.ts:8112`: emit-side direct function calls test
  `resolveFunctionSig` presence with `sig !== undefined` before emitting the
  top-level function call.
- `src/codegen.ts:9596`: identifier-as-function-value inference tests the
  optional signature explicitly before constructing the fn value type and
  recording its monomorph.
- `src/codegen.ts:10262`: infer-side direct function calls test optional
  signature presence explicitly before returning the signature return type.

## Consequences

- **Accepted**: direct function calls and top-level function values continue to
  resolve and lower as before.
- **Rejected**: absent direct functions still fall through to fn-typed local
  handling or existing unknown-function diagnostics.
- **Regression**: no examples were added because observable behavior is
  unchanged; build, self-host probe, and smoke tests remain the guard.
- **Self-host**: the old `src/codegen.ts:8112:11` optional-signature truthiness
  blocker is removed. The next probe blocker is recorded in the phase outcome.
- **Scope out**: generic functions as bare values and broader optional-presence
  cleanup remain governed by existing behavior and later blockers.
