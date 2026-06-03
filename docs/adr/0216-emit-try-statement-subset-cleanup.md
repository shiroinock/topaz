# 0216. emitTryStatement subset cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0215](./0215-emit-throw-statement-value-anchor.md) moved the full-graph
self-host probe to `src/codegen.ts:5509:9`, where `emitTryStatement` tested the
optional `finallyBlock` with TypeScript truthiness. The same helper also kept
optional `catch` checks, full-node diagnostic anchors, uninitialized compiler
locals, string truthiness, and local `try/finally` restore blocks that Topaz
intentionally does not support for compiler source.

[0134](./0134-monomorph-scope-restore-without-finally.md) and
[0213](./0213-emit-statement-loop-restore-cleanup.md) established the normal
path restore rule for emitter state: a codegen error aborts the current compile,
so exception-safe restoration is not required for self-host cleanup.

## Decision

Normalize only `emitTryStatement` to explicit optional presence checks, minimal
diagnostic anchors, initialized locals, strict boolean conditions, and
normal-path restoration of `liveTryFrames` and `scope`.

Rejected alternatives: adding `finally` lowering was rejected because this is a
compiler-source cleanup, not a language feature step. Broadening
`CodegenError` anchor assignability was rejected because exact object matching
must remain a self-hosting constraint. Sweeping the adjacent
`checkTryBodyNoEscape` recursive local-function blocker was rejected as the next
phase's scope.

## Implementation

- `src/codegen.ts:5509-5528` stores optional `finallyBlock`, `catchClause`, and
  catch binding names in locals, then rejects missing pieces with explicit
  `undefined` comparisons and minimal `{ pos: number }` anchors.
- `src/codegen.ts:5533-5545` initializes the catch error type to `unknown`,
  narrows an explicit binding type with a minimal type anchor, and preserves the
  existing class-or-unknown validation.
- `src/codegen.ts:5551-5565` removes the two compiler-source `try/finally`
  restore blocks and restores `liveTryFrames` and `scope` immediately after
  successful try-body and catch-body emission.
- `src/codegen.ts:5583` replaces catch body string truthiness with an explicit
  length check while preserving the generated C for successful try/catch
  lowering.

## Consequences

- **Accepted**: `finally`, bare `try`, and catch-without-binding diagnostics
  remain user-facing compatible.
- **Accepted**: catch without an annotation still defaults to `unknown`;
  explicit `: unknown` and class annotations remain accepted.
- **Accepted**: try body emission still runs with `liveTryFrames` incremented,
  so escaping returns preserve existing `topaz_try_pop()` behavior.
- **Rejected**: `finally` lowering, `break` / `continue` through try bodies,
  catch binding semantic changes, and broader restore cleanup remain out of
  scope.
- **Regression**: no new example was added because this is compiler-source
  cleanup with no user-visible behavior change; existing try/catch smoke cases
  and the full self-host probe cover it.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:5509:9` optional truthiness blocker and
  now stops at `src/codegen.ts:5614:56`: `unknown identifier 'walkExpr'`.
