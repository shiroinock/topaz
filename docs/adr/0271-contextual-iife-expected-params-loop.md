# 0271 - contextual IIFE expected params loop

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0270](./0270-fn-value-call-diagnostic-anchors.md) advanced the self-host probe
to `src/codegen.ts:8190:29`. The reached blocker was inside
`emitContextualIIFE`: expected callback parameters for the contextual arrow
were built with `expr.args.map((a, i) => ...)`. Topaz intentionally supports
only unary `Array.map` callbacks, and the existing
`array_map_callback_arity_fail` regression preserves that subset boundary.

## Decision

Preserve the unary `Array.map` subset and rewrite only the contextual IIFE
expected-parameter construction to an explicit indexed loop. The loop keeps the
same generated parameter names, argument order, and `inferType` calls before
passing the collected `ParamInfo` array into `expectedFn`. Rejected
alternatives: supporting two-argument `Array.map` callbacks was rejected because
it broadens the language subset and contradicts the existing fail regression;
special-casing this source shape in self-hosting was rejected because compiler
source cleanup is simpler; sweeping every `.map(...)` in `src/codegen.ts` was
rejected as broader than the reached blocker.

## Implementation

- `src/codegen.ts:8188`: `emitContextualIIFE` now initializes
  `expectedParams` as `Array<ParamInfo>` and fills it with a `for` loop over
  `expr.args`.
- `src/codegen.ts:8191`: each loop iteration pushes the same synthetic
  `__p${i}` name, inferred argument type, and non-optional flag previously
  produced by the mapped callback.
- `src/codegen.ts:8199`: `expectedFn.params` now receives the collected
  `expectedParams` array.

## Consequences

- **Accepted**: contextual IIFE expected-parameter construction keeps the same
  names, inferred types, order, and contextual return behavior.
- **Rejected**: two-argument `Array.map` callbacks remain unsupported.
- **Regression**: no examples were added because observable compiler behavior
  is unchanged; the existing `array_map_callback_arity_fail` case continues to
  guard the callback arity boundary.
- **Self-host**: the old `src/codegen.ts:8190:29` two-argument map callback
  blocker is removed. The next probe blocker is recorded in the phase outcome.
- **Scope out**: broader `.map(...)` source cleanup and Array.map API expansion
  remain outside this phase.
