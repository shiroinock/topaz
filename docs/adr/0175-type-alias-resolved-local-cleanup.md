# 0175. type alias resolved local cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0174](./0174-type-parameter-scope-explicit-lookup.md) moved the full graph
self-host probe to `src/codegen.ts:3687:52`, where `typeFromAnnotationCore`
returned `alias.resolved` after checking the same optional field. The current
Topaz subset does not narrow repeated optional property reads into a stable
non-optional local, and the alias branch already follows the normal-path cleanup
policy from [0171](./0171-type-annotation-core-cleanup.md).

## Decision

Snapshot `alias.resolved` into `cachedAliasType` and return that local when the
memoized type exists. For fresh resolution, compute `resolvedAliasType` in a
local, assign it back to `alias.resolved`, clear `alias.resolving`, and return
the local instead of rereading the optional field.

Rejected alternatives: adding stronger optional field narrowing for repeated
property reads is broader type-system work; using a non-null assertion keeps
the unstable property reread and would hide the same source shape; restoring
`try/finally` around alias resolution would reintroduce syntax that remains
unsupported and was deliberately removed by [0171](./0171-type-annotation-core-cleanup.md).

## Implementation

- `src/codegen.ts:3687` through `src/codegen.ts:3688` now snapshot the memoized
  alias type in `cachedAliasType` before returning it.
- `src/codegen.ts:3694` through `src/codegen.ts:3697` now store the freshly
  resolved alias type in `resolvedAliasType`, memoize it, clear the resolving
  flag on the normal path, and return the local.
- `src/codegen.ts:3689` through `src/codegen.ts:3693` keep circular alias
  detection, the resolving guard, and alias-body anchor construction unchanged.

## Consequences

- **Accepted**: cached alias resolution still returns the memoized `TopazType`.
- **Accepted**: fresh alias resolution still memoizes before returning and still
  clears `alias.resolving` on the normal path.
- **Accepted**: circular aliases still reject before resolving the alias body.
- **Rejected**: general optional property-read narrowing remains unsupported.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe plus the existing 269 smoke
  cases.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:3687:52` optional field return mismatch
  and now stops at `src/codegen.ts:3704:46`, where `node.typeArgs[0]!` uses a
  non-null assertion after the indexed read is already non-optional.
