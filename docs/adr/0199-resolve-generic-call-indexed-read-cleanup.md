# 0199. resolveGenericCall indexed read cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0198](./0198-resolve-generic-call-minimal-anchors.md) moved the full graph
self-host probe to `src/codegen.ts:4805:43`, where `resolveGenericCall` used
redundant non-null assertions after indexed array reads. Topaz array indexing
already returns the element type directly, so preserving those assertions would
require changing non-null assertion semantics instead of cleaning up the
compiler source.

Earlier indexed-read cleanup ADRs established that these self-hosting blockers
should be handled by removing redundant `!` sites or by spelling real
invariants explicitly, not by adding optional indexing semantics.

## Decision

Replace the indexed non-null assertions in `resolveGenericCall` with loop-local
values, and materialize inferred or explicit generic `typeArgs` with an
explicit loop over `generic.typeParams`. If a substitution is unexpectedly
absent after the arity and inference checks, report an internal invariant with
`throwInternalCodegenError`.

Rejected alternatives: changing non-null assertion lowering would widen the
language semantics; treating all array indexed reads as optional would change
the subset; rewriting generic inference or monomorph worklist behavior is
outside this phase's fixed cleanup scope.

## Implementation

- `src/codegen.ts:4805` through `src/codegen.ts:4808` read explicit type
  argument nodes and type parameter names into locals before resolving and
  storing substitutions.
- `src/codegen.ts:4824` through `src/codegen.ts:4827` read inference parameter
  and argument nodes into locals before calling `inferType` and
  `unifyTypeParam`.
- `src/codegen.ts:4839` through `src/codegen.ts:4846` replace
  `generic.typeParams.map((tp) => subs.get(tp)!)` with an explicit
  materialization loop and an internal missing-substitution invariant.

## Consequences

- **Accepted**: explicit and inferred generic function calls keep the same
  substitution, monomorph naming, and worklist behavior.
- **Rejected**: no optional array indexing, non-null assertion, generic
  inference, or diagnostic-anchor behavior changed.
- **Regression**: no new example was added because this is compiler-source
  cleanup covered by the full graph self-host probe plus the existing generic
  smoke cases.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4805:43` non-null assertion blocker and
  now stops at `src/codegen.ts:4845:21` with a type mismatch while pushing the
  explicit `subs.get` result into `typeArgs`.
