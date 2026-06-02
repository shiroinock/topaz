# 0067. unsupported anchor shape (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0066](./0066-pos-to-line-col-indexed-non-null-cleanup.md) moved the full
graph self-host probe to `src/codegen.ts:688`, where `unsupported` passed its
full `{ kind, pos }` argument to `CodegenError`. `CodegenError` only needs a
`{ pos }` anchor, and exact anonymous object identity rejects the wider object
shape in the self-host path.

## Decision

Construct a `{ pos: node.pos }` anchor at the `CodegenError` call site while
keeping `node.kind` in the diagnostic message.

Rejected alternatives: widening anonymous object assignability would be a
language design change; changing `CodegenError` to require `{ kind, pos }`
would overfit one helper and pollute other diagnostic call sites.

## Implementation

- `src/codegen.ts:688` passes `{ pos: node.pos }` to `CodegenError` from
  `unsupported`.

## Consequences

- **Accepted**: unsupported diagnostics keep the same message and source
  position.
- **Rejected**: no anonymous-object assignability rule is changed.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
