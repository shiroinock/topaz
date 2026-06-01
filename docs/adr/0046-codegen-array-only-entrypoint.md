# 0046. Codegen array-only entrypoint (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-01
- **Phase**: 1.5-6i prep

## Context

[0045](./0045-module-scoped-function-c-symbols.md) moved the full graph
self-host probe past module-local function symbol collisions and exposed the
public `codegen` helper's convenience parameter:
`SourceModule | Array<SourceModule>`. Topaz can lower `T | undefined` and
discriminated unions, but it does not yet have a principled value
representation for a general non-optional union such as a single module or an
array of modules.

The production CLI already calls `codegen(graph.files)`, where `graph.files` is
an `Array<SourceModule>`. The single-module helper shape was a leftover from
older single-file flows, so it blocked self-hosting without serving the current
compiler pipeline.

## Decision

Make `codegen` accept `Array<SourceModule>` only and remove the `Array.isArray`
dispatch. This keeps the self-hosting-facing compiler source inside the current
subset while preserving the CLI's actual module-graph entrypoint.

Rejected alternatives: implementing general `T | U` C representation now is the
desired long-term capability in some form but requires choices about layout,
narrowing, equality, containers, and diagnostics; adding a one-off
`SourceModule | Array<SourceModule>` lowering would hide a language gap behind
one public helper; keeping the union annotation while rewriting the body would
leave the unsupported signature blocker in place.

## Implementation

- `src/codegen.ts:9626` changes the exported helper signature to
  `Array<SourceModule>`.
- `src/codegen.ts:9627` now constructs an `Emitter` and directly emits the
  provided module array; the old `Array.isArray` branch and single-module wrap
  path are gone.
- `src/cli.ts:126` already passes `graph.files`, so no CLI call-site change was
  needed.

## Consequences

- **Accepted**: `codegen(graph.files)` remains the compiler entrypoint, and the
  full graph probe can lower the `codegen` signature as a plain module array.
- **Rejected**: `codegen(singleSourceModule)` is no longer the default public
  helper shape in this cut.
- **Regression**: no new example was added because runtime behavior is
  unchanged; `pnpm run build` and `pnpm test` cover the call-site surface.
- **Next blocker**: the old `SourceModule | Array<SourceModule>` blocker is
  gone. The full graph probe now stops later with `cTypeName: union
  topaz_union_class_anon_88_or_string is not \`T | undefined\``.
- **Future direction**: this is a temporary self-hosting cut, not a rejection of
  principled non-optional unions or public API ergonomics. Topaz should
  eventually support real union representation where the subset needs it, or
  restore ergonomic public entry points through explicit functions such as a
  single-module wrapper and a module-graph entrypoint. It should not accumulate
  ad hoc special cases like a bespoke `Array.isArray` lowering.
