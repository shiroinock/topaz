# 0107. moduleId internal error helper (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0106](./0106-module-id-value-no-bang.md) moved the full graph self-host probe
to `src/codegen.ts:1895`, where `moduleId` threw `new Error(...)` for a missing
module id. Topaz source does not support constructing the built-in `Error`
value.

## Decision

Use `throwInternalCodegenError(...)` for this impossible internal branch. The
missing module id path is an invariant failure after `emit` populates the module
id arrays, not a source-code diagnostic anchored to user input.

Rejected alternative: adding built-in `Error` construction support is exception
model work and unnecessary for this compiler-internal branch.

## Implementation

- `src/codegen.ts:1895` replaces `throw new Error(...)` with
  `throwInternalCodegenError(...)`.

## Consequences

- **Accepted**: the internal failure remains formatted and fatal.
- **Rejected**: no built-in `Error` support is added.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
