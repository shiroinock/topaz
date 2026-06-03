# 0235. emitExpression leading diagnostic anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0234](./0234-checkcontinueallowed-diagnostic-anchors.md) advanced the
full-graph self-host probe into the first unsupported branch of
`emitExpression`. The `null_lit`, `this_expr`, and `ident` diagnostics still
passed rich expression variants where the diagnostic path only needed a source
position. Exact anonymous object matching therefore rejected those calls before
the probe could reach the next expression-lowering blocker.

This follows the same source-cleanup direction as
[0067](./0067-unsupported-anchor-shape-6i-prep.md),
[0210](./0210-emitstatement-return-minimal-anchors.md),
[0214](./0214-emitstatement-unsupported-minimal-anchor.md), and
[0234](./0234-checkcontinueallowed-diagnostic-anchors.md): keep diagnostics
source-anchored without accepting wider object shapes.

## Decision

Keep `emitExpression` semantics unchanged and replace the leading diagnostic
anchors with local minimal `{ pos: number }` objects. The `null_lit` branch
now emits the same unsupported-expression message directly, invalid `this`
uses pass only `{ pos }`, and `ident` failures for unknown identifiers or
missing base bindings no longer pass the full identifier variant.

Rejected alternatives: broadening `unsupported`, `CodegenError`, or anonymous
object assignability was rejected because it would weaken the exact-object
discipline. Changing `null`, `this`, identifier capture lookup, or top-level
function value lookup was rejected because this phase is a self-host source
cleanup, not a frontend semantics change.

## Implementation

- `src/codegen.ts:6882-6896` uses minimal anchors for unsupported `null`,
  invalid `this`, and the adjacent string-literal helper call that only needs
  a position.
- `src/codegen.ts:6910-6924` keeps capture lookup and top-level function value
  emission but rewrites optional checks to explicit `!== undefined` and passes
  `{ pos: expr.pos }` into identifier diagnostics.
- `src/codegen.ts:6930-6952` keeps scalar optional reads and dunion-to-class
  casts unchanged while using explicit optional narrowing for the base binding
  and `withoutUndefined` result.

## Consequences

- **Accepted**: no new expression syntax is accepted; ordinary identifier,
  capture, top-level function, scalar optional, dunion-to-class, and
  unknown-to-class emission continue to lower through the existing paths.
- **Rejected**: unsupported `null`, invalid `this`, unknown identifier, and
  missing base-binding diagnostics keep their existing messages and source
  positions.
- **Regression**: no new example was added because behavior is unchanged;
  `pnpm test` passes with the existing smoke suite.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:6883:19` blocker and now stops at
  `src/codegen.ts:6987:7`:

  ```text
  cannot access '.name' on discriminated union topaz_dunion_anon_12_or_anon_15_or_anon_16_or_anon_17_or_anon_18_or_anon_19_or_anon_20_or_anon_21_or_anon_22_or_anon_23_or_anon_24_or_anon_25_or_anon_26_or_anon_27_or_anon_30_or_anon_31_or_anon_32_or_anon_70_or_anon_71_or_anon_72_or_anon_73_or_anon_74_or_anon_75_or_anon_76_or_anon_77_or_anon_8 - narrow it first with `switch (x.kind)`
  ```
