# 0342 - Array.push spread arguments

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.14

## Context

After [0341](./0341-finally-return-context-local-narrowing.md), the self-host
probe advanced to `src/codegen.ts:5817:16`, where
`lines.push(...this.emitCatchBindingLines(...))` used call-argument spread.
`Array.push(...items)` is a common TypeScript/JavaScript idiom and maps to a
simple repeated-push lowering, while general function-call spread would require
tuple and arity-aware call lowering that the current subset does not need.

## Decision

Support spread only in `Array<T>.push(...)` arguments for now. The lowering
evaluates the receiver once, evaluates fixed arguments and spread source
expressions left-to-right into temporaries, snapshots each spread source length,
reserves the destination capacity, then emits repeated `topaz_array_*_push`
calls in source order. Fixed arguments use `emitWithExpected(_, T)`, and spread
elements use `applyCoercion(source->data[i], S, T, anchor)` so class-to-interface,
class-to-dunion, and wider-dunion coercions match other value-passing sites.
Rejected alternatives: general `f(...args)` lowering was rejected because it
needs tuple/function-spread semantics; `new C(...args)` lowering remains
unsupported; Set and Iterator spread sources for `Array.push` stay out of
scope; changing `Array.push` to return a value was rejected because Topaz keeps
it `void`.

## Implementation

- `src/codegen.ts:8936` keeps the call-wide spread precheck but lets
  non-optional Array `.push(...)` calls continue to the dedicated lowering.
- `src/codegen.ts:9133` detects the first spread argument and confirms the
  callee is an Array `.push` before bypassing the generic reject.
- `src/codegen.ts:9238` routes Array `.push` to the new helper instead of the
  former one-argument-only lowering.
- `src/codegen.ts:9445` implements variadic/spread `Array.push` evaluation,
  length snapshotting, element compatibility checks, and per-element coercion.
- `tests/smoke.sh:378` registers the positive case and two new failure cases.

## Consequences

- **Accepted**: `arr.push(v)`, `arr.push(a, ...xs, b)`, `arr.push(...arr)`, and
  `Array<Tag>` spread into `Array<Named>` are supported.
- **Rejected**: `sum(...xs)` still fails with the generic call-spread message;
  `new C(...xs)` still fails with the existing `new` spread message.
- **Rejected**: `dst.push(...notArray)` and element mismatches get
  Array.push-specific diagnostics.
- **Regression**: `examples/array_push_spread.ts`,
  `examples/array_push_spread_mismatch_fail.ts`, and
  `examples/array_push_spread_non_array_fail.ts`.
- **Current blocker**: `pnpm run test:selfhost` now advances to
  `src/codegen.ts:5885:32`, where `resolveCatchBinding(catchClauseMaybe)` still
  sees `catchClauseMaybe` as `topaz_class_anon_47 | undefined`.
