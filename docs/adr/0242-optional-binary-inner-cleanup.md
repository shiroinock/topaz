# 0242 - optional binary inner cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0241](./0241-assignment-special-branch-cleanup.md) advanced the self-host probe
into binary optional operator lowering in `Emitter.emitExpression`. The next
blocker was the optional equality branch:
`src/codegen.ts:7290:15: type mismatch: expected topaz_boolean, got
topaz_union_dunion_..._or_undefined`.

The accepted language behavior was already correct: `x === undefined`,
`x !== undefined`, and `a ?? b` are checked by `inferType`, then lowered using
the existing scalar `.present`, interface/dunion `.data`, and reference pointer
sentinels. The remaining issue was source shape: the implementation still used
truthy checks and a non-null assertion around `withoutUndefined(...)` results.

## Decision

Keep optional equality and nullish coalescing semantics unchanged, but make the
inner optional type explicit in the binary operator implementation. The emit
paths now branch on `innerMaybe !== undefined` before reading `kind`, while the
infer path uses explicit `innerMaybe === undefined` handling and minimal
diagnostic anchors.

Rejected alternatives: broadening `??` to non-optional left operands was
rejected because this phase is a self-host source cleanup, not a language
expansion. Changing scalar/interface/dunion/reference sentinel representation
was rejected because the existing lowering is covered and stable. Sweeping
unrelated `withoutUndefined(...)` or optional-chain sites was rejected to keep
the phase limited to binary optional operators.

## Implementation

- `src/codegen.ts:7251`: `emitExpression(bin_op ??)` now stores the
  `withoutUndefined(lt)` result in `innerMaybe` and keeps the coalesce lowering
  inside the `innerMaybe !== undefined` branch, with an internal consistency
  error for an impossible missing inner after `inferType`.
- `src/codegen.ts:7284`: `emitExpression(bin_op ===/!== undefined)` now uses
  the same explicit inner branch before choosing `.present`, `.data`, or
  pointer sentinel checks.
- `src/codegen.ts:9907`: `inferType(bin_op ??)` now replaces the truthy
  `!inner` test with `innerMaybe === undefined`, keeps the existing diagnostic
  text, and reports the left-operand diagnostics through `{ pos: expr.pos }`.

## Consequences

- **Accepted**: no new optional forms are accepted; `T | undefined` equality
  and `??` retain the existing type and C lowering rules.
- **Rejected**: non-optional `??` operands, truthy/falsy optional conditions,
  and unsupported optional sentinel representations remain rejected.
- **Regression**: no new examples were added because observable behavior is
  unchanged; the existing 280 smoke entries cover coalesce, optional equality,
  dunion optional, scalar optional, and non-optional coalesce failures.
- **Self-host**: the old `src/codegen.ts:7290:15` blocker is resolved. The
  probe now stops at `src/codegen.ts:7318:9: variable declaration must have an
  initializer`, in the later `&&`/`||` compound-condition lowering branch.
- **Scope out**: parser, AST shape, runtime, `extractNarrowing`, carry
  narrowing, optional chain, non-null assertion, and optional accept/reject
  rules are unchanged.
