# 0104. extractDecls root source without non-null assertion (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0103](./0103-preallocated-anon-optional-set-reuse.md) moved the full graph
self-host probe to `src/codegen.ts:1842`, where `extractDecls` used
`sourceFiles[sourceFiles.length - 1]!`. Topaz's current array access typing
returns `T`, so the non-null assertion is rejected because the operand is not
`T | undefined`.

## Decision

Remove the non-null assertion from the root source lookup. This keeps the
existing runtime assumption that codegen receives at least one source module and
aligns the compiler source with the current subset's array access type.

Rejected alternative: changing array access to return `T | undefined` would be a
language-wide semantic change and is out of scope for this self-hosting cleanup.

## Implementation

- `src/codegen.ts:1842` reads the final source module without `!`.

## Consequences

- **Accepted**: `extractDecls` compiles under Topaz's current array access
  typing.
- **Rejected**: no array bounds/optional semantics are changed.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
