# 0265 - console checked argument local

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0264](./0264-special-call-callee-local-narrowing.md) advanced the self-host
probe to `src/codegen.ts:7970:23`. The reached blocker was the emit-side
`console.log` / `console.error` branch: `checkConsoleCallArgs(expr, method)`
validated arity and accepted scalar types, but returned `void`, so the caller
still read `expr.args[0]!`. The self-host subset does not use the preceding
arity check to prove the indexed read is present.

## Decision

Preserve console behavior and make the shared console argument checker return
the validated `Expr`. The helper keeps the same arity and unsupported-type
diagnostics, binds `const arg = expr.args[0]`, and returns that checked local
for the emit-side console branch. Rejected alternatives: adding general
array-index proof from `args.length === 1` was rejected as a larger
type-system feature; inlining the helper was rejected because it is already the
shared console gate; sweeping every built-in `expr.args[0]!` was rejected as
too broad for this phase.

## Implementation

- `src/codegen.ts:7908`: `checkConsoleCallArgs` now returns `Expr`, keeps the
  existing arity check, performs the existing type rejection on the local
  `arg`, and returns it.
- `src/codegen.ts:7970`: the emit-side `console.log` / `console.error` branch
  now obtains `arg` from `checkConsoleCallArgs` instead of reading
  `expr.args[0]!` after validation.

## Consequences

- **Accepted**: `console.log` and `console.error` with number, boolean, and
  string arguments keep the same lowering.
- **Rejected**: `undefined`, union, `unknown`, class/reference, and interface
  values remain unsupported for console output with the existing diagnostics.
- **Regression**: no examples were added because observable behavior and
  diagnostics are unchanged; build, self-host probe, and smoke tests remain the
  guard.
- **Self-host**: the old `src/codegen.ts:7970:23` console argument non-null
  blocker is removed. The next probe blocker is recorded in the phase outcome.
- **Scope out**: broader built-in argument non-null cleanup remains for later
  phases.
