# 0222. module init for statement cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0221](./0221-declaration-diagnostic-anchors.md) moved the full-graph
self-host probe to `src/codegen.ts:5874:39`, where `emitModuleGlobalInit`
combined a `Stmt` kind guard and optional initializer guard before reading
`.init`. The adjacent `emitForStatement` helper still used optional truthiness,
an uninitialized body local, and `try/finally` restore blocks that are outside
the Topaz compiler-source subset.

[0134](./0134-monomorph-scope-restore-without-finally.md) and
[0213](./0213-emit-statement-loop-restore-cleanup.md) established normal-path
restore for emitter state while `finally` remains unsupported.

## Decision

Split module-global initialization into a `Stmt` kind switch, explicit
`undefined` checks, and narrowed locals before emitting the assignment. Because
the current self-host subset does not narrow the captured `stmt` parameter
inside the old `withSfString` callback shape, keep the same ambient module
save/restore logic directly in `emitModuleGlobalInit` and restore on the normal
path.

Normalize `emitForStatement` to explicit optional locals for init, condition,
and update, and restore loop/scope state on the normal successful path after
emitting the body.

Rejected alternatives: broadening discriminated-union access or optional
truthiness was rejected as type-system work; adding `finally` lowering was
rejected as a language feature; touching for-of lowerings or changing loop and
module-global semantics was rejected as outside this phase.

## Implementation

- `src/codegen.ts:5872-5901` switches on `stmt.kind`, binds the narrowed
  `var_decl` as `d`, checks `d.init` and `moduleGlobalTypes.get(d.name)` with
  positive `undefined` branches, and emits the same global assignment text.
- `src/codegen.ts:6131-6161` replaces for-init, condition, and update
  truthiness/ternary checks with explicit `!== undefined` locals.
- `src/codegen.ts:6163-6177` emits the for body while the loop context is live,
  then pops loop context and scope on the normal path before returning the
  existing `for (${initStr}; ${condStr}; ${incrStr}) ...` format.

## Consequences

- **Accepted**: module global initialization behavior and generated C remain
  unchanged on successful codegen.
- **Accepted**: `for` init / condition / update optionality and break/continue
  behavior are unchanged.
- **Rejected**: no new narrowing rule, optional truthiness, `finally` lowering,
  or for-of cleanup is introduced.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by existing module global, for, break/continue, and smoke coverage.
  `tests/smoke.sh` coverage is unchanged.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5874:39` `.init` access blocker and now
  stops at `src/codegen.ts:5925:17`: cannot access `.text` on the expression
  discriminated union in `tryScalarLiteralInit` before narrowing it with
  `switch (x.kind)`.
