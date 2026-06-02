# 0137. array join helper internal error (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0136](./0136-array-join-helper-string-initializer.md) moved the full graph
self-host probe to `src/codegen.ts:2665`, where `emitArrayJoinHelper` used
`throw new Error(...)` for an unreachable unsupported element kind. Topaz does
not support `new Error`, and compiler internals already use
`throwInternalCodegenError` for impossible states.

## Decision

Replace the `new Error` throw with `throwInternalCodegenError`.

Rejected alternative: adding JavaScript `Error` construction support would
expand the runtime and exception model and is unnecessary for this internal
compiler-source cleanup.

## Implementation

- `src/codegen.ts:2665` calls `throwInternalCodegenError` with the existing
  diagnostic text.

## Consequences

- **Accepted**: the array join helper's impossible-state path stays in the
  compiler's internal error channel.
- **Rejected**: no `Error` class/runtime support is added.
- **Regression**: no new example was added because this is a compiler-source
  cleanup exercised by the full graph probe.
