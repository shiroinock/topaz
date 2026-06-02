# 0106. moduleId value without non-null assertion (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0105](./0105-extract-decls-statement-error-anchor.md) moved the full graph
self-host probe to `src/codegen.ts:1893`, where `moduleId` used
`this.moduleIdValues[i]!`. Topaz array access currently returns the element type,
so the non-null assertion is rejected because the operand is not optional.

## Decision

Remove the non-null assertion from the module id value lookup. The module id
arrays are populated together in `emit`, and this change only aligns the source
with the current subset's array access typing.

Rejected alternative: changing array access to return `T | undefined` remains a
language-wide decision and is out of scope for this self-hosting cleanup.

## Implementation

- `src/codegen.ts:1893` returns `this.moduleIdValues[i]` directly.

## Consequences

- **Accepted**: `moduleId` compiles under current Topaz array access typing.
- **Rejected**: no array access semantics are changed.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
