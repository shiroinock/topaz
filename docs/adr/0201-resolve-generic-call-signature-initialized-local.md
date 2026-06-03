# 0201. resolveGenericCall signature initialized local

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0200](./0200-resolve-generic-call-substitution-narrowing.md) moved the full
graph self-host probe to `src/codegen.ts:4861:5`, where `resolveGenericCall`
declared `let sig: FunctionSig` before assigning it inside a `try` block.
Topaz intentionally rejects uninitialized `let` and `const` declarations.

[0134](./0134-monomorph-scope-restore-without-finally.md) already established
that compiler-source generic scope cleanup can use normal-path restoration when
the compilation aborts on thrown codegen errors.

## Decision

Initialize the generic call signature directly from `withSfFunctionSig(...)` and
restore `typeParamScope` after the successful signature-resolution call.

Rejected alternatives: allowing uninitialized local declarations would broaden
Topaz declaration semantics; introducing a dummy `FunctionSig` placeholder would
hide the actual invariant; changing `withSfFunctionSig`, `collectParams`,
generic inference, monomorph naming, or worklist behavior is outside this
phase's fixed compiler-source cleanup scope.

## Implementation

- `src/codegen.ts:4859` through `src/codegen.ts:4866` now set
  `typeParamScope`, initialize `sig` as a `const` from `withSfFunctionSig(...)`,
  and restore `typeParamScope` on the normal path.
- `src/codegen.ts:4873` and `src/codegen.ts:4878` continue to store and return
  the same resolved `sig` for the new monomorph entry.

## Consequences

- **Accepted**: `resolveGenericCall` no longer depends on an uninitialized
  `FunctionSig` local.
- **Accepted**: generic function signature resolution, substitution,
  monomorph naming, and worklist behavior remain unchanged.
- **Rejected**: no global declaration-initialization rule, `finally` lowering,
  or generic emission behavior changed.
- **Regression**: no new example was added because this is compiler-source
  cleanup covered by the full graph self-host probe plus existing generic smoke
  cases.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4861:5` uninitialized local blocker and
  now stops at `src/codegen.ts:4862:75` with `type mismatch: expected
  topaz_class_anon_88, got topaz_class_anon_90`.
