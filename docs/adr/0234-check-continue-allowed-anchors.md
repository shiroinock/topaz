# 0234. checkContinueAllowed diagnostic anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0233](./0233-emit-switch-statement-subset-cleanup.md) advanced the full-graph
self-host probe into `checkContinueAllowed`, where both `continue` diagnostics
still passed the full `ContinueStmt` variant to `CodegenError`. The current
self-host subset requires exact anonymous object matching, so a richer statement
shape is not assignable to the minimal `{ pos: number }` diagnostic anchor.

Recent source cleanups such as
[0214](./0214-emit-statement-unsupported-minimal-anchor.md) keep source
diagnostics anchored with local minimal objects when only a position is needed.

## Decision

Keep `checkContinueAllowed` loop-context semantics unchanged and create a local
`stmtAnchor: { pos: number }` from `stmt.pos`. Pass that anchor to both
`CodegenError` calls: `continue` outside loops remains rejected, and `continue`
inside lowered `switch` bodies remains rejected because switch still emits
`do { ... } while (0)`.

Rejected alternatives: broadening `CodegenError` or `unsupported` to accept
arbitrary statement variants was rejected because exact anonymous object
matching should remain strict. Relaxing anonymous object or dunion assignability
was rejected as a language semantics change. Removing the switch-specific
`continue` rejection was rejected because it would change generated control
flow for the existing switch lowering.

## Implementation

- `src/codegen.ts:6858-6874` creates a minimal `{ pos: number }` diagnostic
  anchor inside `checkContinueAllowed`.
- `src/codegen.ts:6865-6872` preserves both existing rejection messages while
  passing the minimal anchor instead of the full `ContinueStmt`.
- Loop context push/pop, switch lowering, parser, AST, and runtime behavior are
  unchanged.

## Consequences

- **Accepted**: ordinary loop `continue` remains accepted through the existing
  loop-context stack.
- **Rejected**: `continue` outside a loop and `continue` inside a lowered
  switch still produce the same diagnostics at the continue statement position.
- **Regression**: no new example was added because behavior is unchanged;
  `pnpm test` passes with the existing smoke suite.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:6865:30` blocker and now stops at
  `src/codegen.ts:6883:19`:

  ```text
  type mismatch: expected topaz_class_anon_148, got topaz_class_anon_74
  ```
