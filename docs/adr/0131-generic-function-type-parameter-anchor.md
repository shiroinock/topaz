# 0131. generic function type parameter anchor (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0130](./0130-function-redeclaration-anchor.md) moved the full graph self-host
probe to `src/codegen.ts:2135`, where duplicate generic function type parameter
diagnostics passed a full `TypeParam` object to `CodegenError`. The constructor
only requires `{ pos: number }`, and class generic registration already uses a
minimal type parameter anchor.

## Decision

Create `tpAnchor: { pos: number }` inside the generic function type parameter
loop and use it for duplicate type parameter diagnostics.

Rejected alternative: widening the diagnostic constructor would make unrelated
AST shapes part of its type contract.

## Implementation

- `src/codegen.ts:2134` creates `tpAnchor` from `tp.pos`.
- `src/codegen.ts:2136` uses `tpAnchor` for duplicate generic function type
  parameter diagnostics.

## Consequences

- **Accepted**: generic function and generic class type parameter duplicate
  diagnostics use the same anchor pattern.
- **Rejected**: no diagnostic constructor widening or structural subtyping
  relaxation is introduced.
- **Regression**: no new example was added because this is a compiler-source
  cleanup exercised by the full graph probe.
