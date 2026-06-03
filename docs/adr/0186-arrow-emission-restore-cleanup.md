# 0186. Arrow emission restore cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0185](./0185-capture-map-keys-iteration-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:4318:15`, where `emitArrowFunction` still
used `try/finally` to restore arrow-body emission state. Prior restore cleanup
ADRs ([0134](./0134-monomorph-scope-restore-without-finally.md),
[0170](./0170-source-context-helper-cleanup.md),
[0171](./0171-type-annotation-core-cleanup.md), and
[0178](./0178-function-emission-restore-cleanup.md)) established the
compiler-source policy: codegen errors abort the current compile, so internal
state only needs to be restored on the normal path.

## Decision

Remove the `try/finally` from `emitArrowFunction` and restore the same compiler
state immediately after normal arrow body emission completes. The arrow helper
still pushes the barrier and inner scope before parameter/body emission, still
builds the same C signature, forward declaration, and definition lines, and
still restores capture context, return type, live try frame count, and loop
context before building the call-site compound literal.

Rejected alternatives: implementing `finally` lowering is broader language work
and does not belong in this source cleanup; keeping `emitArrowFunction` as a
one-off exception would keep blocking self-hosting; changing arrow capture or
body lowering semantics would add risk without addressing the blocker.

## Implementation

- `src/codegen.ts:4285` still pushes the arrow emission barrier and inner scope
  before body emission.
- `src/codegen.ts:4287` declares arrow parameters and emits the block or
  expression body on the same normal path that previously lived inside `try`.
- `src/codegen.ts:4304` keeps the C function signature and arrow forward /
  definition lines unchanged.
- `src/codegen.ts:4317` now pops the inner scope and barrier, then restores
  capture context, current return type, live try frames, and loop context on the
  normal path.

## Consequences

- **Accepted**: arrow body emission restores the same state after successful
  body/signature emission.
- **Accepted**: thrown codegen errors still abort the compile instead of
  attempting state recovery.
- **Rejected**: `finally` remains unsupported as source syntax.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe plus the existing 277 smoke
  checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4318:15` `finally` blocker and now
  stops at `src/codegen.ts:4288:70` with `type mismatch: expected
  topaz_class_anon_88, got topaz_class_anon_30`.
