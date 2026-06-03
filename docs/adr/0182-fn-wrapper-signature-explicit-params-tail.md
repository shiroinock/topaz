# 0182. fn wrapper signature explicit params tail

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0181](./0181-fn-helper-positive-narrowing-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:4100:106`, where
`fnValueWrapperSignature` used `params ? ", " + params : ""` to decide whether
to append user-visible parameters after the hidden `void *__topaz_env`
argument. Topaz conditions are strict boolean, so string truthiness remains
unsupported even for compiler-internal helper code.

## Decision

Keep the joined `params` string, but derive the emitted comma tail with an
explicit `params.length > 0` check before interpolating the wrapper signature.
This preserves the generated C for both empty and non-empty parameter lists
while keeping the compiler source inside the existing strict-boolean subset.

Rejected alternatives: adding string truthiness would contradict the documented
language divergence; restructuring wrapper generation more broadly would be
unnecessary because the current signature shape is already correct; batching
other ternaries would widen the phase beyond the observed blocker.

## Implementation

- `src/codegen.ts:4100` computes `paramsTail` with `params.length > 0`.
- `src/codegen.ts:4101` interpolates that tail after `void *__topaz_env`, so
  empty wrappers still emit only the environment parameter and non-empty
  wrappers still emit `void *__topaz_env, <params>`.

## Consequences

- **Accepted**: fn value wrapper signatures no longer rely on string
  truthiness in compiler source.
- **Accepted**: generated C remains unchanged for empty and non-empty wrapper
  parameter lists.
- **Rejected**: string truthiness is still unsupported for Topaz programs.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe plus the existing 277 smoke
  checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4100:106` strict-boolean blocker and
  now stops at `src/codegen.ts:4143:22` because `popLoopCtx` accesses `.prev`
  on `LoopCtxFrame | undefined` without first storing the narrowed value.
