# 0203. instantiateGenericClass subset cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0202](./0202-resolve-generic-call-signature-anchors.md) moved the full graph
self-host probe to `src/codegen.ts:4899:10`, where `instantiateGenericClass`
used a truthy/falsy optional check for generic class type arguments. Topaz
requires strict boolean conditions, so `Array<TypeNode> | undefined` must be
narrowed with explicit `undefined` comparisons.

The same helper also still used indexed non-null assertions, a `map` callback
with a non-null substitution read, and local `try/finally` restoration of
`typeParamScope`. [0134](./0134-monomorph-scope-restore-without-finally.md)
already established normal-path scope restoration for compiler-source cleanup
when codegen errors abort the current compilation.

## Decision

Normalize only `instantiateGenericClass` to the current self-host subset:
explicit optional narrowing, checked indexed reads, explicit substitution
collection, and normal-path `typeParamScope` restoration. Generic class arity,
type argument resolution, mangling, pre-registration, class monomorph worklist
queuing, and recursive generic class behavior remain unchanged.

Rejected alternatives: adding truthy/falsy condition semantics would broaden the
language subset; broadening array indexed reads or non-null assertion lowering
would hide the precise compiler-source cleanup needed here; adding `finally`
lowering is a separate language feature; changing generic class inference,
mangling, or registration is outside this phase.

## Implementation

- `src/codegen.ts:4899` computes `providedTypeArgCount` with explicit
  `typeArgNodes !== undefined` narrowing before the arity diagnostic.
- `src/codegen.ts:4909` narrows `typeArgNodes` to `concreteTypeArgNodes` before
  indexed access.
- `src/codegen.ts:4914` bounds-checks the type argument and type parameter
  arrays before indexed reads and substitution insertion.
- `src/codegen.ts:4925` builds `typeArgs` with an explicit loop and checked
  `subs.get(...) !== undefined` reads.
- `src/codegen.ts:4961` restores `typeParamScope` after `collectClassMembers`
  on the normal path, matching the existing self-hosting cleanup pattern.

## Consequences

- **Accepted**: generic class instantiation uses strict boolean-compatible
  optional checks and checked indexed reads.
- **Accepted**: generic class substitution, mangling, pre-registration, and
  worklist behavior stay unchanged.
- **Rejected**: no truthy/falsy, indexed-read, non-null assertion, or `finally`
  lowering support is added.
- **Regression**: no new example was added because this is compiler-source
  normalization covered by existing generic class, strict boolean, optional
  narrowing, and full graph self-host probe coverage.
- **Probe**:
  `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4899:10` strict-boolean mismatch and
  now stops at `src/codegen.ts:4997:13` with `type mismatch: expected
  topaz_class_anon_88, got topaz_class_anon_0`.
