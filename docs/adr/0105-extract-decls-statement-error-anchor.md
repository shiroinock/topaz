# 0105. extractDecls statement error anchor (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0104](./0104-extract-decls-root-source-no-bang.md) moved the full graph
self-host probe to `src/codegen.ts:1880`, where `extractDecls` passed a
statement union directly to `CodegenError`. The constructor accepts the exact
anchor shape `{ pos: number }`, and Topaz exact object matching rejects the
richer statement union.

## Decision

Create an explicitly annotated `{ pos: number }` anchor from `stmt.pos` in the
non-root module rejection path and pass that anchor to `CodegenError`.

Rejected alternative: broadening `CodegenError` to accept all statement variants
would be larger than this local compiler-source cleanup and would not improve
diagnostic behavior.

## Implementation

- `src/codegen.ts:1879` creates `stmtAnchor`.
- `src/codegen.ts:1880` passes `stmtAnchor` to `CodegenError`.

## Consequences

- **Accepted**: diagnostics keep the same statement position.
- **Accepted**: exact object matching no longer rejects this error path.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
