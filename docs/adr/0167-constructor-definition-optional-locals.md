# 0167. constructor definition optional locals (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0166](./0166-method-signature-explicit-tail-check.md) moved the full graph
self-host probe to `src/codegen.ts:3344`, where `emitConstructorDefinition` used
`if (declSf)` on `SourceModule | undefined`. The same helper also checked
`ctor.decl` via truthiness and used the constructor/class declaration object as
the parameter binding anchor.

## Decision

Use explicit `!== undefined` checks for optional constructor-emission state,
store `ctor.decl` in a local, and create a minimal `{ pos: number }` parameter
binding anchor from either the present constructor declaration or the class
declaration fallback.

Rejected alternative: truthy optional checks and wide declaration anchors would
broaden language behavior instead of adapting the compiler source to the subset.

## Implementation

- `src/codegen.ts:3344` checks `declSf !== undefined`.
- `src/codegen.ts:3349` stores `ctor.decl` in `ctorDecl`.
- `src/codegen.ts:3350` creates a minimal parameter anchor.
- `src/codegen.ts:3368` checks the auto-constructor branch with
  `ctorDecl === undefined`.
- `src/codegen.ts:3375` checks the user-body branch with
  `ctorDecl !== undefined`.

## Consequences

- **Accepted**: constructor definition emission no longer relies on optional
  truthiness or wide anchors.
- **Rejected**: no truthy optional narrowing or structural anchor widening is
  added.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe.
