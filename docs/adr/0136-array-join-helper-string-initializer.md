# 0136. array join helper string initializer (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0135](./0135-set-helper-spread-push-loop.md) moved the full graph self-host
probe to `src/codegen.ts:2657`, where `emitArrayJoinHelper` declared
`toStringStmt` without an initializer before assigning it in element-kind
branches. Topaz requires `let` and `const` declarations to be initialized.

## Decision

Initialize `toStringStmt` to the empty string and keep the existing exhaustive
branch assignments for supported scalar array element kinds.

Rejected alternative: relaxing initialized declaration requirements would change
the language subset and is unnecessary for this compiler-source cleanup.

## Implementation

- `src/codegen.ts:2657` initializes `toStringStmt` to `""`.

## Consequences

- **Accepted**: array join helper emission stays within the initialized-let
  subset.
- **Rejected**: no uninitialized `let` support is added.
- **Regression**: no new example was added because uninitialized declarations are
  already covered as unsupported and this is a compiler-source cleanup exercised
  by the full graph probe.
