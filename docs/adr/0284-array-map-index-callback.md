# 0284 - Array.map index callback

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0283](./0283-optional-chain-present-emitter-function-call.md) advanced the
self-host probe to `src/codegen.ts:9595:35`, where `emitOptionalMethodCall`
used `expr.args.map((a, i) => ...)`. [0271](./0271-contextual-iife-expected-params-loop.md)
kept `Array.map` unary-only at the time, but the current compiler source uses
the common TypeScript index callback shape often enough that preserving it is
the smaller source constraint.

## Decision

Support `Array.map` callbacks with either `(value)` or `(value, index)`. The
first parameter remains the source element type and the optional second
parameter is Topaz `number`, receiving the zero-based loop index. Keep the
third JavaScript callback parameter unsupported, keep `Array.filter` unary-only,
and preserve existing `Array.map` result restrictions for `void`, `undefined`
unions, and missing Array monomorphs. Rejected alternatives: rewriting every
compiler `.map((x, i) => ...)` site into loops was rejected as needless source
churn; adding the third `array` argument was rejected because no current
self-host blocker needs it; loosening the shared callback inference helper was
rejected because it would broaden unrelated callback APIs.

## Implementation

- `src/codegen.ts:4212`: adds `inferArrayMapCallbackFn`, selecting `[elem]` or
  `[elem, number]` based on callback arity for arrows and fn-valued callbacks.
- `src/codegen.ts:8310`: emit-side `Array.map` lowering now uses the map-specific
  callback inference helper.
- `src/codegen.ts:8341`: the generated C callback call passes `(topaz_number)i`
  only when the callback has two user-visible parameters.
- `src/codegen.ts:10163`: infer-side `Array.map` mirrors the same arity and
  parameter type rules before forming the result array type.
- `examples/array_method_map.ts:70`: adds positive arrow and fn-valued callback
  regressions that consume the index.
- `examples/array_map_callback_arity_fail.ts:3` and
  `examples/array_map_index_param_mismatch_fail.ts:3`: preserve rejection of the
  third callback argument and non-number index annotations.

## Consequences

- **Accepted**: `xs.map((x) => ...)`, `xs.map((x, i) => ...)`, annotated
  `i: number`, and fn-valued callbacks with one or two parameters.
- **Rejected**: `xs.map((x, i, arr) => ...)`, non-number second parameter
  annotations, unsupported map result element types, and `Array.filter((x, i)
  => ...)`.
- **Regression**: `array_method_map`, `array_map_callback_arity_fail`,
  `array_map_index_param_mismatch_fail`, and existing Array.map/filter fail
  cases cover the new boundary. `tests/smoke.sh` now has 281 primary
  compile/run/fail checks including CLI failure checks.
- **Self-host**: the old `Array.map callback arity 2 does not match expected 1`
  blocker is removed; the probe now reaches a later non-null assertion blocker
  in `src/codegen.ts`.
- **Scope out**: third callback argument support, `Array.filter` index
  callbacks, and broader callback API changes remain unsupported.
