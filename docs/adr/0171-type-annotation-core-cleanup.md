# 0171. type annotation core cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0170](./0170-source-context-helper-cleanup.md) moved the full graph self-host
probe to `src/codegen.ts:3846`, where `typeFromAnnotation` used `try/finally`
to restore `currentTypeModule`. The same helper also carried adjacent patterns
that the Topaz subset does not yet lower: optional truthiness checks and a
second `try/finally` around alias resolving. [0134](./0134-monomorph-scope-restore-without-finally.md)
already established that compiler state can be restored on the normal path for
self-host cleanup because thrown codegen errors abort the current compile.

## Decision

Split `typeFromAnnotation` into a small source-module wrapper and
`typeFromAnnotationCore`, keeping context mutation out of the core resolver.
The wrapper restores `currentTypeModule` after the normal result is available.
Within the core resolver, use explicit `undefined` checks for optional values
and resolve type aliases with normal-path `alias.resolving` cleanup.

Rejected alternatives: implementing `finally` lowering is broader language work
and remains out of scope; adding general truthy optional narrowing would change
type-system behavior beyond this blocker; rewriting wider type machinery or
parser behavior is unnecessary for the local source cleanup.

## Implementation

- `src/codegen.ts:3590` through `src/codegen.ts:3599` make
  `typeFromAnnotation` the wrapper that sets and normally restores
  `currentTypeModule`.
- `src/codegen.ts:3602` through `src/codegen.ts:3852` move the old annotation
  resolver body into `typeFromAnnotationCore`.
- `src/codegen.ts:3607`, `src/codegen.ts:3633`, `src/codegen.ts:3640`, and
  `src/codegen.ts:3662` replace same-helper optional truthiness with explicit
  `undefined` checks.
- `src/codegen.ts:3675` through `src/codegen.ts:3687` keep alias memoization and
  circular alias detection while removing alias-resolution `try/finally`.
- `src/codegen.ts:3697`, `src/codegen.ts:3712`, and `src/codegen.ts:3725`
  explicitly test absent Array / Map / Set monomorphs with `=== undefined`.

## Consequences

- **Accepted**: supported TypeScript annotations continue through the same core
  resolver after the wrapper establishes source-module context.
- **Accepted**: recursive alias cycle detection still rejects a circular alias,
  and successful alias resolution still memoizes `alias.resolved`.
- **Rejected**: `finally` remains unsupported as source syntax, and truthy /
  falsy narrowing remains unsupported.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe plus existing smoke tests.
- **Probe**: `node dist/cli.js src/cli.ts --emit-c-only -o build/selfhost_cli_probe`
  advances past the old `src/codegen.ts:3846` `finally` blocker and now stops at
  `src/codegen.ts:3616:30` with `type mismatch: expected topaz_class_anon_88, got topaz_class_anon_66`.
