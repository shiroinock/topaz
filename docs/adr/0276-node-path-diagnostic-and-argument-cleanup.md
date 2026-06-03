# 0276 - node:path diagnostic and argument cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0275](./0275-stdlib-helper-diagnostic-and-argument-cleanup.md) advanced the
self-host probe from adjacent stdlib helpers into the `node:path` helper
cluster. The next blocker was `src/codegen.ts:8954:9`, where the `dirname`
arity diagnostic passed the full `CallExpr` object to `CodegenError`. The same
cluster still had post-arity `expr.args[n]!` reads in `dirname`, `resolve`,
`basename`, `extname`, and `join`.

## Decision

Preserve the current `node:path` supported and rejected surface. Diagnostics in
the path helper cluster now pass minimal `{ pos: ... }` anchors, and check
helpers return checked argument locals for emit-side lowering instead of
re-indexing `expr.args[n]!` after validation. Rejected alternatives: adding new
`node:path` APIs or overloads was rejected because this phase is only a
self-hostability cleanup; changing POSIX path behavior or runtime helpers was
rejected because existing smoke cases already define the behavior; including
global `parseInt` / `parseFloat` helpers was rejected so the next helper band
can be handled separately.

## Implementation

- `src/codegen.ts:101`: added a checked-argument result type for the
  `basename(path, ext?)` helper without optional fields, keeping the shape
  self-hostable.
- `src/codegen.ts:8957`: `checkNodePathDirnameArgs` now anchors arity and path
  diagnostics on `{ pos }` and returns the checked path expression.
- `src/codegen.ts:8984`: `checkNodePathResolveArgs` now anchors arity and
  segment diagnostics on `{ pos }` and returns the checked segment array.
- `src/codegen.ts:9015`: `checkNodePathBasenameArgs` returns checked path/ext
  locals plus a `hasExt` flag so emission no longer re-indexes call arguments.
- `src/codegen.ts:9056`: `checkNodePathExtnameArgs` applies the same `{ pos }`
  and checked-path pattern for `extname`.
- `src/codegen.ts:9083`: `checkNodePathJoinArgs` returns a checked segment
  array, preserving zero-argument `join()` lowering.

## Consequences

- **Accepted**: existing valid `dirname(path)`, `resolve(...segments)`,
  `basename(path, ext?)`, `extname(path)`, and `join(...segments)` behavior is
  unchanged.
- **Rejected**: wrong arity/type, non-string variadic segments, bare shortcut
  identifier value use, and unknown named imports from `node:path` remain
  rejected.
- **Regression**: no new examples were added because behavior is unchanged;
  existing `node_path_*` smoke cases cover the accept/reject boundaries.
  `tests/smoke.sh` has 280 primary compile/run/fail entries, or 296 `run_*`
  entries including warning-free variants.
- **Self-host**: the old `src/codegen.ts:8954:9` blocker is removed. The next
  probe blocker is `src/codegen.ts:9114:9` in the `parseInt` helper cluster.
