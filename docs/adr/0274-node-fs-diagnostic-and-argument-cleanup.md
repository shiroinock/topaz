# 0274 - node:fs diagnostic and argument cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0273](./0273-string-method-diagnostic-and-argument-cleanup.md) advanced the
self-host probe from String method diagnostics into the `node:fs` helper
cluster. The next blocker was `src/codegen.ts:8627:9`, where the
`readFileSync` arity diagnostic passed the full `CallExpr` object to
`CodegenError`. The same helper cluster still had post-arity `expr.args[n]!`
reads in `readFileSync`, `existsSync`, `writeFileSync`, and `mkdirSync`.

## Decision

Preserve the current `node:fs` supported and rejected surface. Diagnostics in
the `node:fs` helper cluster now pass minimal `{ pos: ... }` anchors, and the
helpers return checked argument locals for emit-side lowering instead of
re-indexing `expr.args[n]!` after validation. Rejected alternatives: adding new
Node fs APIs or overloads was rejected because this phase is only a
self-hostability cleanup; loosening `readFileSync`, `writeFileSync`, or
`mkdirSync` argument contracts was rejected because the current call-site
shortcut subset is intentionally narrow; routing unsupported forms to runtime
was rejected because they must remain compile-time diagnostics.

## Implementation

- `src/codegen.ts:91`: added a small checked-argument result type for the
  two-string `writeFileSync` helper.
- `src/codegen.ts:8629`: `checkNodeFsReadFileSyncArgs` now anchors arity,
  path, and encoding diagnostics on `{ pos }` and returns the checked path
  expression for `emitNodeFsReadFileSync`.
- `src/codegen.ts:8669`: `checkNodeFsExistsSyncArgs` applies the same `{ pos }`
  and checked-path pattern for `existsSync`.
- `src/codegen.ts:8696`: `checkNodeFsWriteFileSyncArgs` returns checked path
  and content expressions so `emitNodeFsWriteFileSync` no longer re-indexes the
  call arguments.
- `src/codegen.ts:8735`: `checkNodeFsMkdirSyncArgs` anchors path/options
  diagnostics on `{ pos }`, narrows the `recursive` literal value explicitly,
  and returns the checked path expression for emission.
- `src/codegen.ts:10244`: infer-side value-use diagnostics for `writeFileSync`
  and `mkdirSync` now use minimal `{ pos: expr.pos }` anchors.

## Consequences

- **Accepted**: existing valid `readFileSync(path, "utf8")`, `existsSync(path)`,
  `writeFileSync(path, content)`, and `mkdirSync(path, { recursive: true })`
  behavior is unchanged.
- **Rejected**: wrong arity, non-string paths, unsupported read encodings,
  non-string write content, invalid mkdir options, value-use of void fs calls,
  and bare shortcut identifier value use remain rejected.
- **Regression**: no new examples were added because behavior is unchanged;
  existing `node_fs_read_file*`, `node_fs_exists*`, `node_fs_write_file*`, and
  `node_fs_mkdir*` smoke cases cover the accept/reject boundaries.
  `tests/smoke.sh` has 281 `run_*` entries.
- **Self-host**: the old `src/codegen.ts:8627:9` blocker is removed. The next
  probe blocker is `src/codegen.ts:8803:9` in the `execFileSync` helper cluster.
