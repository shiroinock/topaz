# 0116. sourceFiles index without non-null assertion (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0115](./0115-module-id-values-empty-array-annotation.md) moved the full graph
self-host probe to `src/codegen.ts:1951`, where `emit` used `sourceFiles[i]!`.
Topaz array access currently returns the element type, so the non-null assertion
is rejected because the operand is not optional.

## Decision

Remove the non-null assertion from the module id population loop. The loop bounds
already use `i < sourceFiles.length`, and this change aligns the source with the
current array access type.

Rejected alternative: changing array access to return `T | undefined` remains a
language-wide decision and is out of scope for this self-hosting cleanup.

## Implementation

- `src/codegen.ts:1951` pushes `sourceFiles[i]` directly.

## Consequences

- **Accepted**: module id population compiles under current Topaz array access
  typing.
- **Rejected**: no array access semantics are changed.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
