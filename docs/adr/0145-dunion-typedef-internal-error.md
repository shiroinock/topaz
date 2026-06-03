# 0145. dunion typedef internal error (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0144](./0144-set-monomorph-internal-error.md) moved the full graph self-host
probe to `src/codegen.ts:2877`, where `emitDunionTypedef` used
`throw new Error(...)` when called with a non-dunion type. Topaz does not support
`new Error`, and this is a compiler impossible-state path.

## Decision

Replace the `new Error` throw with `throwInternalCodegenError`.

Rejected alternative: adding JavaScript `Error` construction support would
expand the runtime and exception model and is unnecessary for this internal
compiler-source cleanup.

## Implementation

- `src/codegen.ts:2877` calls `throwInternalCodegenError` with the existing
  diagnostic text.

## Consequences

- **Accepted**: dunion typedef impossible states use the compiler internal error
  channel.
- **Rejected**: no `Error` class/runtime support is added.
- **Regression**: no new example was added because this is a compiler-source
  cleanup exercised by the full graph probe.
