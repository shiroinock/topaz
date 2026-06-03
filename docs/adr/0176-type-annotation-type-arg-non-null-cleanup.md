# 0176. type annotation type-arg non-null cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0175](./0175-type-alias-resolved-local-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:3704:46`, where the `Array<T>` branch in
`typeFromAnnotationCore` used `node.typeArgs[0]!` after an arity check had
already established that the type argument exists. The neighboring built-in
type-reference branches for `Map<K, V>`, `Set<T>`, and `Iterator<T>` used the
same helper-local pattern, so this was a narrow compiler-source cleanup rather
than a language semantics change.

## Decision

Remove the unnecessary non-null assertions from the built-in type-reference
type-argument reads in `typeFromAnnotationCore`, and leave the existing arity
checks, void rejection, monomorph recording, and diagnostics unchanged.

Rejected alternatives: changing non-null assertion semantics to accept
non-optional operands would broaden behavior that existing fail tests
intentionally reject; batch-removing every remaining `!` in `src/codegen.ts`
would cross unrelated helper regions; removing the arity checks would weaken
the current diagnostics for malformed built-in type annotations.

## Implementation

- `src/codegen.ts:3700` through `src/codegen.ts:3711` now lower `Array<T>` by
  reading `node.typeArgs[0]` directly after the existing single-argument check.
- `src/codegen.ts:3713` through `src/codegen.ts:3726` now lower `Map<K, V>` by
  reading `node.typeArgs[0]` and `node.typeArgs[1]` directly after the existing
  two-argument check.
- `src/codegen.ts:3728` through `src/codegen.ts:3739` now lower `Set<T>` by
  reading `node.typeArgs[0]` directly after the existing single-argument check.
- `src/codegen.ts:3745` through `src/codegen.ts:3758` now lower `Iterator<T>` by
  reading `node.typeArgs[0]` directly after the existing single-argument check.

## Consequences

- **Accepted**: `Array<T>`, `Map<K, V>`, `Set<T>`, and `Iterator<T>` keep the
  same arity diagnostics and void element/key/value rejection.
- **Accepted**: array, map, set, and iterator monomorph recording remains on the
  same paths as before.
- **Rejected**: non-null assertions on non-optional operands remain unsupported.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe plus the existing 277 smoke
  checks.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:3704:46` non-null assertion blocker and
  now stops at `src/codegen.ts:3871:70`, where `formatSignature` reports `type
  mismatch: expected topaz_boolean, got topaz_string`.
