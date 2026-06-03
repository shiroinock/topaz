# 0200. resolveGenericCall substitution narrowing

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0199](./0199-resolve-generic-call-indexed-read-cleanup.md) removed redundant
indexed non-null assertions from `resolveGenericCall` and made missing generic
substitutions an explicit internal invariant. The full graph self-host probe
then advanced to `src/codegen.ts:4845:21`, where Topaz still typed the value
read from `subs.get(tp)` as `TopazType | undefined` when pushing it into
`typeArgs`, even though the absent branch had already thrown.

This is a compiler-source cleanup blocker, not a reason to widen optional
narrowing semantics globally.

## Decision

Materialize `typeArgs` with an explicit positive `!== undefined` branch. Inside
that branch, bind the substitution to a local `TopazType` before pushing it into
`typeArgs`; the `else` branch keeps the existing
`throwInternalCodegenError("resolveGenericCall: missing type argument substitution")`
invariant.

Rejected alternatives: changing Topaz narrowing so a preceding throwing
negative branch narrows the later value would be a global language-semantics
change; reintroducing `subs.get(tp)!` would undo the explicit invariant cleanup;
changing generic inference or missing-inference diagnostics is outside this
phase's fixed scope.

## Implementation

- `src/codegen.ts:4841` through `src/codegen.ts:4847` now read each generic
  substitution into `tMaybe`, push only from the positive `!== undefined`
  branch, and leave the missing-substitution branch as the same internal error.

## Consequences

- **Accepted**: explicit and inferred generic calls keep the same substitution
  materialization, monomorph naming, and worklist behavior.
- **Rejected**: no global optional narrowing, generic inference, or diagnostic
  behavior changed.
- **Regression**: no new example was added because this is compiler-source
  cleanup covered by the full graph self-host probe plus existing generic smoke
  cases.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4845:21` push mismatch and now stops at
  `src/codegen.ts:4861:5` because `let sig: FunctionSig` has no initializer.
