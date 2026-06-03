# 0210. emitStatement return minimal anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0209](./0209-emit-statement-return-optional-cleanup.md) normalized optional
return state in `emitStatement` and moved the full graph self-host probe to
`src/codegen.ts:5353`, where the `return_stmt` branch passed the full
`ReturnStmt` object into `CodegenError`. The diagnostic contract needs only
`{ pos: number }`, and Topaz exact anonymous object matching rejects the richer
statement shape. [0105](./0105-extract-decls-statement-error-anchor.md) and
[0172](./0172-type-annotation-minimal-anchors.md) established local minimal
diagnostic anchors as the preferred cleanup.

## Decision

Create a local `stmtAnchor: { pos: number }` from `stmt.pos` immediately after
entering the `return_stmt` branch, then pass that minimal anchor to every
`CodegenError` diagnostic in the branch. Keep the phase 176 optional narrowing
locals and existing return lowering unchanged.

Rejected alternatives: broadening `CodegenError` anchor assignability was
rejected because exact anonymous object matching must stay intact. Changing
return semantics or diagnostic text was rejected because the blocker is only
the diagnostic anchor shape. Sweeping adjacent `emitStatement` branches was
rejected as outside this phase.

## Implementation

- `src/codegen.ts:5351` creates the minimal `stmtAnchor` from `stmt.pos`.
- `src/codegen.ts:5353-5374` uses `stmtAnchor` for the outside-function,
  bare-return-in-non-void, and value-return-in-void diagnostics.
- `src/codegen.ts:5376-5386` keeps the narrowed return value and `liveTryFrames`
  lowering from [0209](./0209-emit-statement-return-optional-cleanup.md).

## Consequences

- **Accepted**: return diagnostics remain anchored at the return statement
  position.
- **Rejected**: no return behavior, diagnostic wording, or anchor assignability
  rule changes are introduced.
- **Regression**: no new example was added because this is compiler-source
  cleanup with no user-visible behavior change; existing return, void,
  try-return, and full smoke cases remain the coverage.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5353:32` exact-object mismatch and now
  stops at `src/codegen.ts:5411:39` with
  `unsupported method '.trimStart' on topaz_string`.
