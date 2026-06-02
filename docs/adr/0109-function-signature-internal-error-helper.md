# 0109. function signature internal error helper (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0108](./0108-function-signature-lookup-no-bang.md) moved the full graph
self-host probe to `src/codegen.ts:1918`, where `functionSigForDecl` threw
`new Error(...)` for a missing signature. Topaz source does not support
constructing the built-in `Error` value.

## Decision

Use `throwInternalCodegenError(...)` for this impossible internal branch. Missing
function signatures indicate a compiler invariant failure after signature
registration, not a source-code diagnostic anchored to user input.

Rejected alternative: adding built-in `Error` construction support is exception
model work and unnecessary for this compiler-internal branch.

## Implementation

- `src/codegen.ts:1918` replaces `throw new Error(...)` with
  `throwInternalCodegenError(...)`.

## Consequences

- **Accepted**: the internal failure remains formatted and fatal.
- **Rejected**: no built-in `Error` support is added.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
