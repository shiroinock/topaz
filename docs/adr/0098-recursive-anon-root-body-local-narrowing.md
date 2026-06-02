# 0098. recursive anon root body local narrowing (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0097](./0097-preallocate-recursive-anons-visit-method.md) moved the full graph
self-host probe to `src/codegen.ts:1713`, where `preAllocateRecursiveAnons`
passed `info.body` to `findPreAllocatedAnon` after checking
`info.body.kind === "type_literal"`. The current self-host flow did not narrow
the repeated property read at the call site.

## Decision

Store `info.body` in a local `body`, use the local for traversal, and pass the
narrowed local inside the positive `body.kind === "type_literal"` branch.

Rejected alternative: broadening property-read narrowing is compiler
flow-analysis work and unnecessary for this local cleanup.

## Implementation

- `src/codegen.ts:1711` introduces `body`.
- `src/codegen.ts:1712` passes `body` to the recursive anon visitor.
- `src/codegen.ts:1714` passes narrowed `body` to `findPreAllocatedAnon`.

## Consequences

- **Accepted**: recursive root alias resolution behavior is unchanged.
- **Rejected**: no property-read narrowing change is added.
- **Regression**: no new example was added because existing recursive alias
  tests cover behavior, and the full graph self-host probe covers this
  compiler-source cleanup.
