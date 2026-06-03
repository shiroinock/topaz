# 0197. Generic lookup presence cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0196](./0196-collect-captures-walker-method-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:4787:10`, where `resolveGenericCall` tested
the optional result of `genericFunctions.get(...)` with a truthy/falsy condition.
Topaz requires strict `boolean` conditions, so compiler-source lookup presence
checks need explicit `undefined` comparisons. This is the same cleanup class as
[0192](./0192-optional-lookup-presence-cleanup.md), but limited to generic
function and generic class lookup paths.

## Decision

Normalize generic-resolution lookup presence checks to explicit
`value === undefined` or `value !== undefined` comparisons, then carry the
narrowed object in a typed local before field access. Keep generic inference,
monomorph naming, worklist behavior, and type-parameter unification unchanged.

Rejected alternatives: adding object truthiness would broaden the subset beyond
self-hosting cleanup; rewriting generic inference would change behavior outside
the blocker; sweeping unrelated `Map.get` sites would exceed this phase's
generic lookup scope.

## Implementation

- `src/codegen.ts:4786` rewrites `genericFunctions.get(callee.name)` to use
  `genericMaybe === undefined` and a typed `GenericFunctionInfo` local.
- `src/codegen.ts:4838` rewrites the generic function monomorph cache hit check
  to `existing !== undefined`.
- `src/codegen.ts:4884` replaces the generic class non-null assertion with an
  explicit internal invariant check and typed `GenericClassInfo` local.
- `src/codegen.ts:5014` splits the generic-class unifier's
  `classMonomorphs.get(...)` presence check from the follow-up `origName`
  comparison.

## Consequences

- **Accepted**: absent generic functions still return `undefined` to let callers
  fall back to concrete dispatch.
- **Accepted**: generic monomorph cache hits and generic-class unification keep
  the same semantics.
- **Rejected**: no truthy/falsy rule, generic inference change, monomorph naming
  change, or broad lookup cleanup was added.
- **Regression**: no example was added because this is compiler-source cleanup;
  coverage comes from the full graph self-host probe plus the existing 290
  top-level smoke invocations, including `generic_fn` and `generic_class`.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:4787:10` boolean-condition blocker and
  now stops at `src/codegen.ts:4795:11` with `type mismatch: expected
  topaz_class_anon_88, got topaz_class_anon_17`.
