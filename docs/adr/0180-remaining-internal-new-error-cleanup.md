# 0180. remaining internal new Error cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0179](./0179-arrow-helper-expected-type-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:4079:32`, where `emitFnTypedef` used
`throw new Error(...)` for an impossible non-fn type. A repo-wide scan showed
the remaining `throw new Error(...)` sites in `src/codegen.ts` were the same
kind of compiler-internal invariant checks in module-global initialization,
fn-value calls, and contextual IIFE lowering. Earlier internal-error cleanup
ADRs established `throwInternalCodegenError(...)` as the local convention for
these paths.

## Decision

Replace the remaining compiler-internal `throw new Error(...)` occurrences in
`src/codegen.ts` with `throwInternalCodegenError(...)`, preserving the existing
message text. Keep `new Error` unsupported as a source-language construct.

Rejected alternatives: implementing `new Error` would be broader runtime and
language work; patching only `emitFnTypedef` would leave equivalent sequential
self-host blockers; converting these impossible states to `CodegenError` would
misclassify them as user-facing source diagnostics instead of internal
invariants.

## Implementation

- `src/codegen.ts:4079` routes the `emitFnTypedef: not a fn type` invariant
  through `throwInternalCodegenError(...)`.
- `src/codegen.ts:5381` and `src/codegen.ts:5385` route initialized module
  global invariants through `throwInternalCodegenError(...)`.
- `src/codegen.ts:7347` and `src/codegen.ts:7391` route fn-value and
  contextual-IIFE fn-shape invariants through `throwInternalCodegenError(...)`.

## Consequences

- **Accepted**: all remaining `throw new Error(...)` occurrences in
  `src/codegen.ts` are removed.
- **Accepted**: internal diagnostic message text is preserved.
- **Rejected**: `new Error` remains unsupported in Topaz source.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe plus the existing 277 smoke
  checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4079:32` unsupported `new Error`
  blocker and now stops at `src/codegen.ts:4081:33` because `.returnType` access
  needs discriminated-union narrowing after the internal invariant check.
