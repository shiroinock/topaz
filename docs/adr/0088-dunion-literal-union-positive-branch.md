# 0088. dunionLiteralFor union positive branch (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0087](./0087-dunion-literal-positive-narrowing.md) moved the full graph
self-host probe to `src/codegen.ts:1407`, where `dunionLiteralFor` accessed
`unionType.discriminator` after an early non-dunion guard. The current self-host
flow did not narrow the discriminated union after that guard.

## Decision

Handle the valid path inside `if (unionType.kind === "dunion")`, copy the
discriminator to a string local, and leave internal-error fallbacks for unknown
classes or malformed class metadata.

Rejected alternatives: broadening flow analysis for never-returning helpers is
compiler work; switching this internal helper to a source-anchored CodegenError
would change its role.

## Implementation

- `src/codegen.ts:1401` switches to the positive dunion branch.
- `src/codegen.ts:1402` stores `unionType.discriminator` in `discriminator`.
- `src/codegen.ts:1407` uses the local discriminator for field lookup and error
  text.

## Consequences

- **Accepted**: valid dunion literal lookup behavior is unchanged.
- **Rejected**: no flow-analysis change is added.
- **Regression**: no new example was added because existing discriminated-union
  tests cover behavior, and the full graph self-host probe covers this
  compiler-source cleanup.
