# 0049. Assignment anchor position type (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-02
- **Phase**: 1.5-6i prep

## Context

[0048](./0048-iterator-source-string-storage.md) moved the full graph
self-host probe past iterator string-literal metadata and exposed another
general-union blocker:
`cTypeName: union topaz_union_class_anon_88_or_dunion_... is not \`T | undefined\``.

Direct stack inspection showed the failing C type was not a user value. It was
the `anchor` parameter of `Emitter.checkAssignTarget`, annotated as
`Expr | { pos: number }`. The helper only needs a diagnostic position for
`CodegenError`.

## Decision

Change `checkAssignTarget` to accept `anchor: { pos: number }`. Every current
call site passes an expression node, and every expression already carries `pos`,
so the narrower structural annotation preserves diagnostic behavior while
keeping self-hosting-facing source out of arbitrary non-optional union lowering.

Rejected alternatives: adding general `Expr | { pos: number }` lowering would
turn a diagnostic-helper convenience into a language representation decision;
splitting the helper into overload-like variants would add boilerplate without
changing behavior; preformatting diagnostics at call sites would duplicate
`CodegenError` position formatting.

## Implementation

- `src/codegen.ts:9102` changes `checkAssignTarget`'s `anchor` parameter from
  `Expr | { pos: number }` to `{ pos: number }`.
- Existing call sites keep passing expression nodes, relying only on their
  shared `pos` field.

## Consequences

- **Accepted**: assignment-target diagnostics keep their existing positions.
- **Rejected**: arbitrary non-optional union lowering is still not introduced.
- **Regression**: no new example was added because the emitted program behavior
  is unchanged; existing assignment and const-reassignment fail cases exercise
  the same diagnostic paths.
- **Future direction**: if broader helper unions become unavoidable, they
  should be handled through a principled union representation rather than
  ad hoc diagnostic shapes.
