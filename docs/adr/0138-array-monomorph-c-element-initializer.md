# 0138. array monomorph C element initializer (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0137](./0137-array-join-helper-internal-error.md) moved the full graph
self-host probe to `src/codegen.ts:2781`, where `emitArrayMonomorphMacro`
declared `cElem` without an initializer before assigning it in element-kind
branches. Topaz requires initialized `let` declarations.

## Decision

Initialize `cElem` to the empty string and keep the existing branch assignments.

Rejected alternative: relaxing initialized declaration requirements would change
the language subset and is unnecessary for this compiler-source cleanup.

## Implementation

- `src/codegen.ts:2781` initializes `cElem` to `""`.

## Consequences

- **Accepted**: array monomorph macro emission stays within the initialized-let
  subset.
- **Rejected**: no uninitialized `let` support is added.
- **Regression**: no new example was added because uninitialized declarations are
  already covered as unsupported and this is a compiler-source cleanup exercised
  by the full graph probe.
