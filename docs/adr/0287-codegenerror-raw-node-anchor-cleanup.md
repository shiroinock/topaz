# 0287 - CodegenError raw node anchor cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0286](./0286-this-expr-infer-current-class-guard.md) advanced the self-host
probe into `inferType(object_lit)`, where `new CodegenError(expr, ...)` passed
a full AST expression node to a constructor that only needs `{ pos: number }`.
TypeScript accepts that structurally, but Topaz's exact anonymous-class
matching treats the expression node shape and the diagnostic-anchor shape as
different anonymous classes.

## Decision

Keep `CodegenError`'s minimal diagnostic-anchor API and construct contextual
`{ pos: node.pos }` object literals at raw-node call boundaries. Rejected
alternatives: widening `CodegenError` to accept expression / object-member
unions was rejected because diagnostics only need a source position and the
wider type would spread exact anonymous-class friction; adding a shared helper
was rejected because helper return shapes can become another anonymous type to
thread through self-hosting; sweeping existing `anchor`, `exprAnchor`, and
similar local variables was rejected because those sites already carry the
intended anchor type.

## Implementation

- `src/codegen.ts:9717`: anchors the object-literal no-context diagnostic with
  `{ pos: expr.pos }`, removing the old self-host blocker.
- `src/codegen.ts:9739`: converts the raw identifier diagnostic in `inferType`.
- `src/codegen.ts:9765`: converts raw property-access diagnostics while leaving
  existing `exprAnchor` sites unchanged.
- `src/codegen.ts:10467`: converts assignment-target diagnostics from raw
  `target` nodes to contextual target-position anchors.
- `src/codegen.ts:10550`: converts `expectType` mismatch diagnostics from raw
  `expr` nodes to contextual anchors.
- `src/codegen.ts:10723`: converts object-literal contextual diagnostics from
  raw `expr`, `kindProp`, and `prop` nodes to explicit `{ pos: ... }` anchors.

## Consequences

- **Accepted**: existing diagnostic messages and file/line/column locations stay
  anchored at the same source nodes.
- **Rejected**: object literal, assignment, `inferType`, and `emitWithExpected`
  semantics are unchanged.
- **Regression**: no examples were added because this is a self-host source
  cleanup over existing negative diagnostics. `pnpm run build`,
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`, and
  `pnpm test` cover the change; `tests/smoke.sh` has 282 primary
  compile/run/fail checks including CLI failure checks.
- **Self-host**: the old `src/codegen.ts:9718:9` raw-node anchor blocker is
  removed; the probe now reaches `src/codegen.ts:9725:66` on
  `captureContext.captures` optional narrowing.
- **Scope out**: broader diagnostic API changes and the new optional-narrowing
  blocker remain out of scope for this phase.
