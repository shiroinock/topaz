# 0147. set helper internal error (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0146](./0146-dunion-typedef-switch-narrowing.md) moved the full graph self-host
probe to `src/codegen.ts:2921`, where `emitSetElemHelpers` used
`throw new Error(...)` for an unsupported set helper element kind. Topaz does not
support `new Error`, and this is a compiler impossible-state path.

## Decision

Replace the `new Error` throw with `throwInternalCodegenError`.

Rejected alternative: adding JavaScript `Error` construction support would
expand the runtime and exception model and is unnecessary for this internal
compiler-source cleanup.

## Implementation

- `src/codegen.ts:2921` calls `throwInternalCodegenError` with the existing
  diagnostic text.

## Consequences

- **Accepted**: set helper impossible states use the compiler internal error
  channel.
- **Rejected**: no `Error` class/runtime support is added.
- **Regression**: no new example was added because this is a compiler-source
  cleanup exercised by the full graph probe.
