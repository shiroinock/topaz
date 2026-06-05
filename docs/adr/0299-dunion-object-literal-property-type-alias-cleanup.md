# 0299 - dunion object-literal property type alias cleanup

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 1.5-6i prep

## Context

[0298](./0298-dunion-object-literal-optional-local-initialization.md) made the
dunion object-literal discriminator local explicitly initialized. After phase
265, the self-host probe advanced to `src/codegen.ts:10873:24`, where assigning
the narrowed `prop` member from `expr.props` into the hand-written optional
`kindProp` shape failed under Topaz's exact anonymous-class matching. TypeScript
accepts the assignment via structural width compatibility because `ObjectPropKV`
has the same required `value`, `pos`, and `end` fields plus `kind` and `name`.

## Decision

Use the exported AST alias `ObjectPropKV` for the discriminator-property local
instead of spelling an anonymous object shape by hand. This keeps the assignment
on the same type identity as the AST member after the `prop.kind === "prop_kv"`
guard and preserves Topaz's exact anonymous-object model. Rejected alternatives:
manually broadening the local shape was rejected because it duplicates the AST
definition and can drift; adding anonymous-object width subtyping was rejected
as a broader language-semantics decision; splitting the loop into parallel
`kindValue` / `kindPos` locals was rejected because it obscures the existing
AST-member flow for no behavior change.

## Implementation

- `src/codegen.ts:24` imports `ObjectPropKV` from `./ast.js` next to the other
  AST node aliases.
- `src/codegen.ts:10871` declares `kindProp` as `ObjectPropKV | undefined`,
  keeping the existing discriminator guard, assignment, undefined check, and
  diagnostic anchors unchanged.

## Consequences

- **Accepted**: dunion object-literal discriminator lookup and variant selection
  keep the same behavior and diagnostics.
- **Rejected**: object-literal-to-dunion semantics, parser / AST definitions,
  and anonymous-object structural width subtyping are unchanged.
- **Regression**: no examples were added because this is a self-host source
  cleanup with no intended observable behavior change.
- **Self-host**: the old `src/codegen.ts:10873:24` exact-shape blocker is
  removed; the next probe blocker should be recorded by the worker outcome.
- **Scope out**: broader source cleanup of hand-written AST member shapes remains
  a separate decision.
