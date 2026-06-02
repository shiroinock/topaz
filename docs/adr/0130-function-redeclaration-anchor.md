# 0130. function redeclaration anchor (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0129](./0129-function-registration-explicit-existing-checks.md) moved the full
graph self-host probe to `src/codegen.ts:2122`, where function registration
passed the full `FunctionDecl` into `CodegenError`. The diagnostic constructor
only requires `{ pos: number }`, and Topaz's EXACT object typing does not treat a
larger declaration object as assignable to that minimal shape.

## Decision

Introduce an explicit `fnAnchor: { pos: number }` in function registration and
use it for both function redeclaration diagnostics in that pass.

Rejected alternative: broadening `CodegenError` to accept arbitrary declaration
objects would weaken the self-hosted type contract and undo the ongoing anchor
normalization work.

## Implementation

- `src/codegen.ts:2117` creates `fnAnchor` from `fn.pos`.
- `src/codegen.ts:2123` uses `fnAnchor` for concrete function redeclaration.
- `src/codegen.ts:2130` uses `fnAnchor` for generic function redeclaration.

## Consequences

- **Accepted**: function registration diagnostics now match the existing
  class/interface/alias `{ pos: number }` anchor pattern.
- **Rejected**: no broader structural assignability or diagnostic constructor
  relaxation is introduced.
- **Regression**: no new example was added because this is a compiler-source
  cleanup exercised by the full graph probe.
