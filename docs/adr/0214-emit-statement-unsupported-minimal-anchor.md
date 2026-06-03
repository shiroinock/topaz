# 0214. emitStatement unsupported minimal anchor

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0213](./0213-emit-statement-loop-restore-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:5474:17`, where the final `emitStatement`
fallback passed the full `Stmt` discriminated union to `unsupported(stmt,
"statement")`. The helper expects an exact `{ kind: string; pos: number }`
shape, while the union value carries a richer exact anonymous object type.

Existing minimal-anchor cleanups, including
[0067](./0067-unsupported-anchor-shape.md),
[0105](./0105-extract-decls-statement-error-anchor.md), and
[0210](./0210-emit-statement-return-minimal-anchors.md), keep diagnostic
anchors local when only source position is required.

## Decision

Replace only the final `emitStatement` fallback with an inline
`CodegenError` that passes a local `stmtAnchor: { pos: number }` built from
`stmt.pos`, while preserving the existing unsupported statement message shape
as `unsupported statement (${stmt.kind})`.

Rejected alternatives: broadening `unsupported` to accept all statement unions
was rejected because exact anonymous object matching should remain intact.
Relaxing anonymous object assignability was rejected as a language semantics
change. Sweeping adjacent `unsupported(...)` call sites or changing handled
statement lowering was rejected as outside this phase.

## Implementation

- `src/codegen.ts:5474` creates a minimal `{ pos: number }` anchor from the
  common statement position field.
- `src/codegen.ts:5475` throws `CodegenError` directly with the preserved
  `unsupported statement (<kind>)` diagnostic text.
- Earlier handled statement branches in `emitStatement` are unchanged.

## Consequences

- **Accepted**: unsupported statement fallback diagnostics remain anchored at
  the statement position.
- **Accepted**: self-hosting progresses without changing any successful
  statement lowering behavior.
- **Rejected**: `unsupported` remains a narrow helper for exact
  `{ kind: string; pos: number }` anchors, and no broader statement-union
  conversion is introduced.
- **Regression**: no new example was added because this is compiler-source
  cleanup with no user-visible behavior change; existing statement smoke tests
  and the full self-host probe cover it.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5474:17` exact-object mismatch and now
  stops at `src/codegen.ts:5487:9` with `type mismatch: expected
  topaz_class_anon_88, got
  topaz_dunion_anon_12_or_anon_15_or_anon_16_or_anon_17_or_anon_18_or_anon_19_or_anon_20_or_anon_21_or_anon_22_or_anon_23_or_anon_24_or_anon_25_or_anon_26_or_anon_27_or_anon_30_or_anon_31_or_anon_32_or_anon_70_or_anon_71_or_anon_72_or_anon_73_or_anon_74_or_anon_75_or_anon_76_or_anon_77_or_anon_8`.
