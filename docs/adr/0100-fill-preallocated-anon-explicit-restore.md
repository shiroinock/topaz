# 0100. fillPreAllocatedAnonFields explicit restore (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0099](./0099-preallocated-string-literal-type-local.md) moved the full graph
self-host probe to `src/codegen.ts:1798`, where `fillPreAllocatedAnonFields`
used `finally` to restore `currentTypeModule`. Topaz source does not support
`finally`.

## Decision

Remove the `try/finally` and restore `currentTypeModule` explicitly after the
field-fill body on the normal path. If validation throws, codegen aborts, so no
later compiler work observes the stale module value.

Rejected alternative: adding `finally` support is language/codegen work and
unnecessary for this compiler-internal restore pattern.

## Implementation

- `src/codegen.ts:1766` removes the `try` block.
- `src/codegen.ts:1798` replaces `finally` with a normal-path assignment.

## Consequences

- **Accepted**: successful preallocated field filling restores the type module.
- **Rejected**: no `finally` support is added.
- **Regression**: no new example was added because existing recursive alias
  tests cover behavior, and the full graph self-host probe covers this
  compiler-source cleanup.
