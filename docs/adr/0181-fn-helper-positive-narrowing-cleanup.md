# 0181. fn helper positive narrowing cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0180](./0180-remaining-internal-new-error-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:4081:33`, where `emitFnTypedef` accessed
`.returnType` after a negative `t.kind !== "fn"` internal guard. The current
Topaz subset does not preserve discriminated-union narrowing through that
negative guard shape, and the same internal invariant pattern existed in nearby
fn helper code.

## Decision

Use explicit `kind === "fn"` branches with positively narrowed locals inside fn
helper internals, then keep the existing non-fn diagnostics on the fallback
path. Also replace the scoped `params[i]!` map callbacks in fn value dispatch
with counted loops so argument emission does not introduce indexed non-null
assertion or callback-shape blockers.

Rejected alternatives: adding negative-guard discriminated-union narrowing is
broader type-system work; casts or non-null assertions would hide source
incompatibilities; changing fn value call or contextual IIFE semantics would be
unnecessary because the emitted dispatch shape is already correct.

## Implementation

- `src/codegen.ts:4050` narrows non-arrow callback fn values with a positive
  branch local before reading callback `.params`.
- `src/codegen.ts:4080` narrows `emitFnTypedef` input with a positive branch
  local before reading `.returnType` and `.params`.
- `src/codegen.ts:7351` narrows fn value calls with `fnValueType` and emits
  arguments through an explicit loop.
- `src/codegen.ts:7402` applies the same positive local and explicit argument
  loop to contextual IIFE dispatch.

## Consequences

- **Accepted**: fn helper property access now uses positive fn locals instead
  of relying on negative-guard narrowing.
- **Accepted**: fn value calls and contextual IIFE lowering keep the same C
  dispatch shape and diagnostic messages.
- **Rejected**: no new discriminated-union narrowing rule is added.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe plus the existing 277 smoke
  checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4081:33` fn `.returnType` narrowing
  blocker and now stops at `src/codegen.ts:4100:106` because the
  `params ? ... : ...` truthiness check in `fnValueWrapperSignature` is not a
  strict boolean.
