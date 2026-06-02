# 0094. markRecursiveAliases state object (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0093](./0093-mark-recursive-aliases-flat-deps.md) moved the full graph
self-host probe to `src/codegen.ts:1545`, where the local recursive
`strongconnect` arrow accessed mutable outer state (`counter`). The current
self-host path did not make that closure-captured state visible.

## Decision

Move Tarjan's mutable state into an `AliasRecursionMarker` class and implement
`strongconnect` as a method. Keep the flat dependency edge arrays from [0093].

Rejected alternative: changing closure capture semantics for this recursive
local arrow is compiler feature work and larger than this compiler-internal
cleanup.

## Implementation

- `src/codegen.ts:985` adds `AliasRecursionMarker` with Tarjan state and helper
  methods.
- `src/codegen.ts:1599` changes `markRecursiveAliases` to build flat edges and
  delegate to `AliasRecursionMarker.markAll()`.

## Consequences

- **Accepted**: recursive alias detection keeps Tarjan's behavior without local
  closure state.
- **Rejected**: no closure capture feature work is added.
- **Regression**: no new example was added because existing recursive alias
  tests cover behavior, and the full graph self-host probe covers this
  compiler-source cleanup.
