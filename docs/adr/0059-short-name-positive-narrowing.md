# 0059. short-name positive narrowing (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-02
- **Phase**: 1.5-6i prep

## Context

[0058](./0058-short-name-internal-error-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:397`, where `arrayShortName` accessed
`.elem` after a negative `t.kind !== "array"` guard. Topaz's current
discriminated-union narrowing supports the positive branch shape for property
access.

## Decision

Rewrite `arrayShortName`, `mapShortName`, and `setShortName` to return from a
positive kind branch, then throw the internal formatted error on the fallback
path. This preserves behavior and matches the subset's narrowing shape.

Rejected alternatives: broadening negative-guard narrowing is a language
feature decision outside this cleanup; adding local casts would hide the same
shape problem.

## Implementation

- `src/codegen.ts:396` returns `elemTag(t.elem)` inside `t.kind === "array"`.
- `src/codegen.ts:401` returns the map key/value tag inside `t.kind === "map"`.
- `src/codegen.ts:406` returns `elemTag(t.elem)` inside `t.kind === "set"`.

## Consequences

- **Accepted**: short-name helper behavior is unchanged.
- **Rejected**: no new negative-guard narrowing behavior is added.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
