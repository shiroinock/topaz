# 0113. emit empty input internal error helper (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0112](./0112-unique-function-signature-no-bang.md) moved the full graph
self-host probe to `src/codegen.ts:1944`, where `emit` threw `new Error(...)`
when invoked with no source files. Topaz source does not support constructing
the built-in `Error` value.

## Decision

Use `throwInternalCodegenError(...)` for this impossible internal branch. The CLI
and loader normally provide at least one `SourceModule`, so an empty input array
is a compiler invariant failure rather than a source-code diagnostic anchored to
user input.

Rejected alternative: adding built-in `Error` construction support is exception
model work and unnecessary for this compiler-internal branch.

## Implementation

- `src/codegen.ts:1944` replaces `throw new Error(...)` with
  `throwInternalCodegenError(...)`.

## Consequences

- **Accepted**: the internal failure remains formatted and fatal.
- **Rejected**: no built-in `Error` support is added.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
