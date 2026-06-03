# 0282 - Optional chain absent predicate initialization

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0281](./0281-optional-chain-diagnostic-and-argument-cleanup.md) advanced the
self-host probe from optional-chain diagnostic anchors into
`lowerOptionalChain`. The next blocker was `src/codegen.ts:9535:5`, where the
optional-chain absent predicate used an uninitialized `let isAbsent: string`
before assigning it in an `if` / `else`. Topaz requires initialized `let` and
`const` declarations, including in compiler-internal source.

## Decision

Compute the absent predicate as an initialized `const` expression inside
`lowerOptionalChain` while preserving optional-chain runtime lowering exactly.
Interface receivers still check their erased payload with `.data == NULL`, and
class, Array, Map, and Set receivers still use pointer `== NULL`. Rejected
alternatives: weakening the language rule for uninitialized `let` declarations
was rejected because the self-hosting subset intentionally enforces initialized
locals; sweeping every similar-looking local in `src/codegen.ts` was rejected
because those sites need separate context; changing absent sentinel policy,
result type construction, absent literal emission, present-value emission, or
coercion was rejected to keep optional-chain behavior unchanged.

## Implementation

- `src/codegen.ts:9535`: `lowerOptionalChain` now initializes `isAbsent` with a
  conditional expression instead of declaring it first and assigning in branches.
- `src/codegen.ts:9536`: the interface branch still emits `${tmp}.data == NULL`.
- `src/codegen.ts:9537`: the non-interface branch still emits `${tmp} == NULL`
  for class, Array, Map, and Set receivers.

## Consequences

- **Accepted**: existing valid `optional_chain`, `optional_basic`,
  `optional_narrow`, `optional_map_get`, `optional_param`, and
  `dunion_optional` behavior is unchanged.
- **Rejected**: `optional_chain_non_optional_fail`,
  `optional_call_fail`, and optional parameter fail cases remain rejected through
  existing diagnostics.
- **Regression**: no new examples were added because existing smoke coverage
  already covers the requested accept/reject surface. `tests/smoke.sh` remains
  at 280 primary compile/run/fail entries.
- **Self-host**: the old `src/codegen.ts:9535:5` initializer-required blocker is
  removed; any later probe blocker is separate follow-up work.
- **Scope out**: optional call support, optional-chain sentinel representation,
  optional-chain result widening, parser changes, and unrelated uninitialized
  locals are unchanged.
