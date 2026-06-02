# 0097. preAllocateRecursiveAnons visit method (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0096](./0096-alias-recursion-info-positive-narrowing.md) moved the full graph
self-host probe to `src/codegen.ts:1659`, where `preAllocateRecursiveAnons`
used a local recursive `visit` arrow. The current self-host path does not
resolve that recursive local function reference.

## Decision

Move the visitor into a private `Emitter` method and call it recursively through
`this.preAllocateRecursiveAnonVisit(...)`.

Rejected alternative: changing local recursive closure handling is compiler
feature work and unnecessary for this compiler-internal traversal.

## Implementation

- `src/codegen.ts:1656` adds `preAllocateRecursiveAnonVisit`.
- `src/codegen.ts:1708` rewrites `preAllocateRecursiveAnons` to call the method.
- `src/codegen.ts:1711` resolves root literal preallocations through a positive
  branch.

## Consequences

- **Accepted**: recursive alias anonymous-class preallocation traversal is
  unchanged.
- **Rejected**: no local recursive closure support is added.
- **Regression**: no new example was added because existing recursive alias
  tests cover behavior, and the full graph self-host probe covers this
  compiler-source cleanup.
