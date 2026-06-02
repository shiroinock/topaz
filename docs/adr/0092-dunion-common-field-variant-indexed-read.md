# 0092. dunion common field variant indexed read (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0091](./0091-dunion-common-field-split-accumulator.md) moved the full graph
self-host probe to `src/codegen.ts:1466`, where `emitDunionCommonFieldRead`
used a non-null assertion after reading `t.variants[i]`. Topaz array indexing
returns the element type directly, so the assertion is redundant and rejected.

## Decision

Read `t.variants[i]` directly.

Rejected alternatives: changing array indexing to return `T | undefined` is a
broad language/runtime decision; allowing redundant non-null assertions would
weaken the subset check.

## Implementation

- `src/codegen.ts:1466` removes the non-null assertion from the variant read.

## Consequences

- **Accepted**: dunion common-field read emission is unchanged.
- **Rejected**: array indexing and non-null assertion rules are unchanged.
- **Regression**: no new example was added because existing dunion common-field
  tests cover behavior, and the full graph self-host probe covers this
  compiler-source cleanup.
