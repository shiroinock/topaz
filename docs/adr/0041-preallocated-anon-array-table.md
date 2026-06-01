# 0041. Preallocated anon array table (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-01
- **Phase**: 1.5-6i prep

## Context

[0040](./0040-module-global-types-name-key.md) removed the
`moduleGlobalTypes` object-key map and moved the full graph self-host probe to
`src/codegen.ts:1005:30`. The next blocker was
`Emitter.preAllocatedAnons: Map<TypeLiteralNode, string>`, paired with
`preAllocatedAnonSf: Map<TypeLiteralNode, SourceModule>`, which required a
class-key map monomorph only for an internal recursive-alias cache.

## Decision

Replace the two object-key maps with one insertion-ordered
`Array<PreAllocatedAnon>` table. Each entry stores a stable
`filePath:pos:end` key, the original `TypeLiteralNode`, its reserved anon class
name, and the declaring `SourceModule`. Within one `SourceModule`, the converted
Topaz AST gives a `TypeLiteralNode` a unique `pos`/`end` span, while `filePath`
disambiguates multi-module programs.

Rejected alternatives: adding general `Map<class, V>` support would broaden
user-visible Map semantics for one compiler-internal cache; using
`Map<string, string>` plus parallel maps for node/module data would keep several
containers in sync by convention; keying only by `node.pos` would collide across
modules.

## Implementation

- `src/codegen.ts:896` adds `PreAllocatedAnon`, the single record shape for the
  cache entry.
- `src/codegen.ts:1007` stores pre-allocated recursive alias anons as
  `Array<PreAllocatedAnon>` instead of two `Map<TypeLiteralNode, ...>` fields.
- `src/codegen.ts:1387` adds span-key helpers and a linear lookup over the
  insertion-ordered table.
- `src/codegen.ts:1423` reserves anon class placeholders by pushing one table
  entry per unique `filePath:pos:end` key.
- `src/codegen.ts:1486` and `src/codegen.ts:1507` iterate the table for both
  recursive-alias fill passes, using the stored node, anon name, and module.
- `src/codegen.ts:3412` makes the `type_literal` annotation branch consult the
  current module plus source span instead of object-key map identity.

## Consequences

- **Accepted**: recursive type alias pre-allocation from
  [0001](./0001-recursive-type-alias.md) is preserved, including deterministic
  insertion order for anon class allocation and generated C shape.
- **Rejected**: no user-facing class-key `Map<K, V>` support is added, and no
  recursive alias accept/reject boundary changes.
- **Regression**: no new example was added because `type_alias_recursive` and
  the existing recursive alias fail samples already cover the observable
  behavior. `tests/smoke.sh` still contains 257 cases.
- **Next blocker**: the old `preAllocatedAnons` blocker is gone. The full graph
  probe now reaches `src/codegen.ts:3128:44` and stops on `fn types cannot
  return void` while lowering `node:child_process` declaration shapes.
