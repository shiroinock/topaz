# 0080. Scope lookup explicit loop narrowing (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0079](./0079-scope-barrier-depth-indexed-read-cleanup.md) moved the full
graph self-host probe to `src/codegen.ts:741`, where `Scope.lookup()` accessed
`frame.bindings` inside `while (frame !== undefined && frame.depth >= floor)`.
The current subset does not carry compound-condition narrowing into the loop
body. The same lookup methods also used JS-style truthy checks for `Map.get`
results.

## Decision

Rewrite `lookup`, `lookupBase`, and `lookupAcrossBarrier` to use explicit loop
guards: break on `undefined`, copy the narrowed frame to a local, check depth
floors inside the body, and test `Map.get` results with `!== undefined`.

Rejected alternatives: teaching compound-condition loop narrowing and truthy
checks is compiler feature work; changing the linked-frame scope representation
would reopen [0038](./0038-scope-linked-frames.md) without changing behavior.

## Implementation

- `src/codegen.ts:740` rewrites `lookup`'s outer frame walk to explicit guards.
- `src/codegen.ts:748` rewrites `lookup`'s narrowing walk to explicit guards.
- `src/codegen.ts:766` rewrites `lookupBase`'s frame walk similarly.
- `src/codegen.ts:792` rewrites `lookupAcrossBarrier` and its narrowing walk
  with the same pattern.

## Consequences

- **Accepted**: scope lookup, base lookup, capture lookup, and narrowing
  precedence are unchanged.
- **Rejected**: no truthy/falsy or compound-condition loop narrowing behavior is
  added.
- **Regression**: no new example was added because existing scope, narrowing,
  closure, and arrow tests cover behavior, and the full graph self-host probe
  covers this compiler-source cleanup.
