# 0141. map monomorph absent initializer (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0140](./0140-fn-array-monomorph-internal-error.md) moved the full graph
self-host probe to `src/codegen.ts:2829`, where `emitMapMonomorphMacro` declared
`optAbsent` without an initializer before assigning it in value-kind branches.
Topaz requires initialized `let` declarations.

## Decision

Initialize `optAbsent` to the empty string and keep the existing branch
assignments.

Rejected alternative: relaxing initialized declaration requirements would change
the language subset and is unnecessary for this compiler-source cleanup.

## Implementation

- `src/codegen.ts:2829` initializes `optAbsent` to `""`.

## Consequences

- **Accepted**: map monomorph macro emission stays within the initialized-let
  subset.
- **Rejected**: no uninitialized `let` support is added.
- **Regression**: no new example was added because uninitialized declarations are
  already covered as unsupported and this is a compiler-source cleanup exercised
  by the full graph probe.
