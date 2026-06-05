# 0294 - constructor and call args indexed non-null cleanup

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 1.5-6i prep

## Context

[0293](./0293-nullish-coalesce-anchor-annotation.md) advanced the self-host
probe to `src/codegen.ts:10585:43`, where `new Map<K, V>()` inference used
TypeScript's indexed non-null assertion on `expr.typeArgs[0]!`. The adjacent
call-argument emission loop used the same source pattern for `params[i]!` and
`args[i]!`. These assertions were implementation conveniences after existing
length and bounds checks, not a language subset requirement.

## Decision

Rewrite the indexed non-null assertion cluster to bind checked locals after the
existing guards. `new Map<K, V>()` still requires exactly two type arguments
before reading them, and call emission still checks arity before walking the
parameter list. Rejected alternatives: adding general indexed non-null assertion
lowering was rejected because arbitrary array-index narrowing is a language
feature decision; leaving the call-argument loop for a later phase was rejected
because it is the same pattern and already in the next self-host path; changing
Map, Set, optional-argument, or default-undefined behavior was rejected because
this phase is source cleanup only.

## Implementation

- `src/codegen.ts:10585` now binds `keyTypeArg` and `valueTypeArg` after the
  `expr.typeArgs.length !== 2` rejection, then passes those locals to
  `typeFromAnnotation`.
- `src/codegen.ts:11028` now binds `p` and `arg` as ordinary locals inside the
  already-bounded call-argument loop before calling `emitWithExpected`.

## Consequences

- **Accepted**: `new Map<K, V>()` constructor inference behavior is unchanged.
- **Accepted**: function and method argument emission behavior, including
  optional trailing arguments lowered to `undefined`, is unchanged.
- **Rejected**: arbitrary indexed non-null assertions on arrays remain outside
  the accepted subset.
- **Regression**: no examples were added because this only removes non-self-host
  source syntax and has no intended observable compiler behavior change.
- **Self-host**: the old `src/codegen.ts:10585:43` indexed non-null assertion
  blocker is removed; the probe now reaches `src/codegen.ts:10753:11`, where
  discriminated-union `.discriminator` access needs prior `switch (x.kind)`
  narrowing.
- **Scope out**: no frontend syntax, runtime, Map/Set, optional-argument, or
  array-index narrowing changes are included.
