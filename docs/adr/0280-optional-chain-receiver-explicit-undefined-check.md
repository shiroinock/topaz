# 0280 - Optional chain receiver explicit undefined check

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0279](./0279-class-interface-member-lookup-explicit-optional-checks.md)
advanced the self-host probe from class/interface member lookup into optional
receiver narrowing. The next blocker was `src/codegen.ts:9428:10`, where
`resolveOptionalReceiver` stored `withoutUndefined(baseType)` as
`TopazType | undefined` and then tested that value with `!inner`. Topaz
conditions are strict `boolean`, so compiler implementation code must narrow
optional values with explicit comparisons.

## Decision

Preserve optional chaining semantics exactly while making the receiver helper's
absence check explicit. `resolveOptionalReceiver` now rejects missing inner
types with `inner === undefined`, keeps the existing no-op optional chain
rejection through `typeEq(inner, baseType)`, and reports the diagnostic through a
stable `{ pos: expr.pos }` anchor. Rejected alternatives: making
`TopazType | undefined` truthy/falsy in conditions was rejected because it would
weaken the strict boolean subset; adding optional call `f?.()` was rejected
because this phase only cleans up receiver narrowing; changing optional-chain
runtime lowering or sweeping unrelated `withoutUndefined(...)` call sites was
rejected to keep the self-host fix localized.

## Implementation

- `src/codegen.ts:9427`: `resolveOptionalReceiver` still derives the receiver
  inner type with `withoutUndefined(baseType)`.
- `src/codegen.ts:9428`: the helper now checks `inner === undefined ||
  typeEq(inner, baseType)` instead of relying on `!inner`.
- `src/codegen.ts:9429`: the optional receiver diagnostic uses a minimal
  `{ pos: expr.pos }` anchor before constructing `CodegenError`.

## Consequences

- **Accepted**: existing valid `optional_chain`, `optional_param`, and optional
  `Map.get` chain behavior is unchanged.
- **Rejected**: `optional_chain_non_optional_fail`, `optional_call_fail`, and
  optional property/method/index access on unsupported receiver kinds remain
  rejected.
- **Regression**: no new examples were added because this is a self-host source
  cleanup over existing behavior. `tests/smoke.sh` keeps the existing
  optional-chain positive and fail cases, with 277 primary compile/run/fail
  entries or 289 `run_*` commands including warning-free checks.
- **Self-host**: the old `src/codegen.ts:9428:10` blocker is removed without
  broadening the optional chaining surface.
- **Scope out**: optional call support, runtime sentinel representation,
  optional-chain result widening, parser changes, and unrelated
  `withoutUndefined(...)` call sites are unchanged.
