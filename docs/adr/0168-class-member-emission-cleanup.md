# 0168. class member emission cleanup cluster (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0167](./0167-constructor-definition-optional-locals.md) moved the full graph
self-host probe to `src/codegen.ts:3386`, where `emitConstructorDefinition`
used `finally` to restore emitter state. Topaz intentionally keeps `finally`
unsupported for now. [0134](./0134-monomorph-scope-restore-without-finally.md)
already established the self-host cleanup pattern: restore compiler state on
the normal path and keep thrown codegen errors as compile-aborting failures.

The adjacent class-member emission helpers share the same local-cleanup shape:
`emitFieldInitializers` used optional truthiness on `fieldInits.get`, and
`emitMethodDefinition` used `try/finally`, a full method declaration as a
parameter binding anchor, and `info.sf!`.

## Decision

Treat class-member emission as one cleanup cluster. Remove `try/finally` from
constructor and method definition emission, restore compiler state on the normal
path, and keep thrown codegen errors as aborting the current compile. Use
explicit optional checks and explicit `{ pos: number }` anchors in the same
cluster.

Rejected alternative: implementing `finally` lowering is broader language work
and remains outside this source-cleanup phase. Leaving adjacent truthy/anchor
issues for separate probe-led commits would preserve behavior but waste
orchestration cycles without adding review value.

## Implementation

- `src/codegen.ts:3348` removes the constructor-definition `try` block.
- `src/codegen.ts:3377` reports constructor returns through a minimal statement
  anchor.
- `src/codegen.ts:3385` stores the rendered constructor definition and
  `src/codegen.ts:3386` through `src/codegen.ts:3389` restore emitter state on
  the normal path.
- `src/codegen.ts:3407` checks field initializer lookup misses with
  `init === undefined`.
- `src/codegen.ts:3421` through `src/codegen.ts:3439` remove method-definition
  `try/finally`, use a minimal method anchor, narrow `info.sf` in the present
  branch, and restore method emission state on the normal path.

## Consequences

- **Accepted**: class member emission avoids `finally` in compiler source.
- **Accepted**: thrown codegen errors still abort the current compile.
- **Accepted**: adjacent optional and anchor cleanups are batched when they share
  the same helper cluster.
- **Rejected**: no `finally` support, truthy optional narrowing, or structural
  anchor widening is added.
- **Regression**: no new example was added because `finally` remains covered as
  an unsupported construct and this cleanup is covered by the full graph probe.
