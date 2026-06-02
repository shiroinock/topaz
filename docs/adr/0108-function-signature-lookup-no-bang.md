# 0108. function signature lookup without non-null assertion (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0107](./0107-module-id-internal-error-helper.md) moved the full graph
self-host probe to `src/codegen.ts:1916`, where `functionSigForDecl` used
`this.functionSigs[i]!`. Topaz array access currently returns the element type,
so the non-null assertion is rejected because the operand is not optional.

## Decision

Remove the non-null assertion from the function signature array lookup. The
signature and declaration arrays are populated together by `registerFunctionSig`,
so this preserves the existing invariant while matching current array access
typing.

Rejected alternative: changing array access to return `T | undefined` remains a
language-wide decision and is out of scope for this self-hosting cleanup.

## Implementation

- `src/codegen.ts:1916` returns `this.functionSigs[i]` directly.

## Consequences

- **Accepted**: `functionSigForDecl` compiles under current Topaz array access
  typing.
- **Rejected**: no array access semantics are changed.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
