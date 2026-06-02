# 0053. typeEq indexed non-null cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-02
- **Phase**: 1.5-6i prep

## Context

[0052](./0052-type-helper-switch-fallthrough-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:284`, where `typeEq` used non-null
assertions after array indexed reads. Topaz array indexing returns the element
type directly, so `!` on those reads is redundant and rejected.

## Decision

Store the indexed values in locals before comparing them. Apply this to both
the union-variant positional comparison and the function-parameter positional
comparison inside `typeEq`.

Rejected alternatives: changing array indexing to return `T | undefined` would
be a broad language/runtime decision; allowing redundant non-null assertions
would weaken a correct subset check.

## Implementation

- `src/codegen.ts:284` reads `a.variants[i]` and `b.variants[i]` into locals
  before calling `typeEq`.
- `src/codegen.ts:295` reads `a.params[i]` and `b.params[i]` into locals before
  comparing parameter types.

## Consequences

- **Accepted**: `typeEq` behavior is unchanged.
- **Rejected**: array indexing and non-null assertion rules are unchanged.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
