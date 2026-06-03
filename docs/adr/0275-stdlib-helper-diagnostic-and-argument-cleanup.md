# 0275 - stdlib helper diagnostic and argument cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0274](./0274-node-fs-diagnostic-and-argument-cleanup.md) advanced the
self-host probe from the `node:fs` helper cluster into `execFileSync`. The next
blocker was `src/codegen.ts:8803:9`, where the `execFileSync` arity diagnostic
passed the full `CallExpr` object to `CodegenError`. The adjacent stdlib helper
band still had the same full-AST diagnostic and post-arity indexing pattern in
`execFileSync`, `fileURLToPath`, `process.exit`, and process stream writes.

## Decision

Preserve the current Node/process supported and rejected surface. Diagnostics
in this helper band now pass minimal `{ pos: ... }` anchors, and check helpers
return checked argument locals where emission needs to reuse them. Rejected
alternatives: adding new `node:child_process`, `node:url`, or `process` APIs was
rejected because this phase is only a self-hostability cleanup; loosening
`execFileSync` options beyond `{ stdio: "inherit" }` was rejected because the
call-site shortcut subset is intentionally narrow; including the larger
`node:path` helper cluster was rejected so this phase stays bounded to the next
adjacent blocker family.

## Implementation

- `src/codegen.ts:96`: added a checked-argument result type for the
  `execFileSync(cmd, args, options)` helper.
- `src/codegen.ts:8805`: `checkNodeChildProcessExecFileSyncArgs` now anchors
  arity, cmd, args, options, property, and initializer diagnostics on `{ pos }`
  and returns the checked `cmd` / `args` expressions.
- `src/codegen.ts:8860`: `emitNodeChildProcessExecFileSync` emits from the
  checked locals instead of re-indexing `expr.args[n]!`.
- `src/codegen.ts:8874`: `checkNodeUrlFileURLToPathArgs` applies the same
  `{ pos }` and checked-argument pattern for `fileURLToPath`.
- `src/codegen.ts:8901`: `checkProcessExitArgs` centralizes arity/type checking
  for `process.exit`, including the zero-argument default path.
- `src/codegen.ts:8927`: `checkProcessStreamWriteArgs` now returns the checked
  string argument so `emitProcessStreamWrite` no longer re-indexes the call.
- `src/codegen.ts:10041`: infer-side value-use diagnostics for `process.exit`,
  process stream writes, and `execFileSync` now use minimal `{ pos: expr.pos }`
  anchors while preserving their diagnostic strings.

## Consequences

- **Accepted**: existing valid `execFileSync(cmd, args, { stdio: "inherit" })`,
  `fileURLToPath(url)`, `process.exit(code?)`, and
  `process.{stdout,stderr}.write(s)` behavior is unchanged.
- **Rejected**: wrong arity/type/options, value-use of void/never helpers, and
  bare value use of `fileURLToPath` remain rejected.
- **Regression**: no new examples were added because behavior is unchanged;
  existing `node_child_process_exec*`, `node_url*`, `import_meta_*`, and
  `process_*` smoke cases cover the accept/reject boundaries.
  `tests/smoke.sh` has 281 `run_*` entries.
- **Self-host**: the old `src/codegen.ts:8803:9` blocker is removed. A later
  self-host blocker is acceptable and should seed the next phase.
