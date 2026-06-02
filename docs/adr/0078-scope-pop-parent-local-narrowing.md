# 0078. Scope pop parent local narrowing (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0077](./0077-codegen-error-message-local-narrowing.md) moved the full graph
self-host probe to `src/codegen.ts:713`, where `Scope.pop()` assigned
`this.current.parent` to `this.current` after checking the property. The current
subset does not narrow repeated optional property reads across that assignment
site.

## Decision

Copy `this.current.parent` to a local `parent`, then assign `this.current =
parent` inside `parent !== undefined`. This follows the local narrowing pattern
used elsewhere in the 6i prep cleanup.

Rejected alternatives: broadening property-read narrowing is a language feature
decision; changing the linked-frame scope representation would reopen
[0038](./0038-scope-linked-frames.md) without need.

## Implementation

- `src/codegen.ts:712` stores `this.current.parent` in `parent`.
- `src/codegen.ts:713` checks `parent !== undefined`.
- `src/codegen.ts:714` assigns the narrowed local to `this.current`.

## Consequences

- **Accepted**: scope pop behavior is unchanged.
- **Rejected**: no new property narrowing behavior is added.
- **Regression**: no new example was added because existing scope, narrowing,
  closure, and arrow tests cover behavior, and the full graph self-host probe
  covers this compiler-source cleanup.
