# 0174. type parameter scope explicit lookup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0173](./0173-type-union-variant-loop-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:3665:48`, where
`typeFromAnnotationCore` called `.has` on `this.typeParamScope` after checking
the same optional property in an `&&` condition. The current Topaz subset does
not narrow repeated optional property reads across `&&` into a non-optional
`Map` receiver. Type-parameter lookup must still run before alias, class, and
interface lookup so a generic `T` shadows same-named declarations inside the
generic body.

## Decision

Snapshot `this.typeParamScope` into a local `typeParamScope`, use
`Map.get(refName)`, and treat `scoped !== undefined` as the successful lookup
case. Keep the existing type-argument rejection inside that successful branch
and otherwise fall through to alias and nominal lookups unchanged.

Rejected alternatives: adding property-read narrowing across `&&` is broader
type-system work; using optional chaining or non-null assertions around `.has`
keeps the source near the unsupported receiver shape and can expose the same
issue at `.get`; moving type-parameter lookup after aliases or classes would
change shadowing semantics.

## Implementation

- `src/codegen.ts:3665` through `src/codegen.ts:3674` now use a local
  `typeParamScope` snapshot, read `const scoped = typeParamScope.get(refName)`,
  reject type arguments only when the scoped type exists, and return `scoped`.
- `src/codegen.ts:3675` onward keeps the alias lookup ordering and fallthrough
  behavior unchanged.

## Consequences

- **Accepted**: type parameters still shadow same-named aliases, classes, and
  interfaces.
- **Accepted**: type arguments on a type parameter still produce the existing
  diagnostic.
- **Accepted**: absent type-parameter scopes and missing entries still fall
  through to alias, built-in, class, and interface lookup.
- **Rejected**: general optional property-read narrowing remains unsupported.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe plus existing smoke tests.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:3665:48` optional Map receiver blocker
  and now stops at `src/codegen.ts:3687:52` with a type mismatch returning
  `alias.resolved`, whose type is still `TopazType | undefined`.
