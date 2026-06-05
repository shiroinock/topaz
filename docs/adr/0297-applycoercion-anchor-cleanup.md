# 0297 - applyCoercion anchor cleanup

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 1.5-6i prep

## Context

[0296](./0296-undefined-literal-anchor-cleanup.md) moved contextual
`undefined` emission onto explicit diagnostic anchors. After phase 263, the
self-host probe advanced to `src/codegen.ts:10792:56`, where `emitWithExpected`
still passed narrowed expression variants directly to `applyCoercion`. TypeScript
accepts that structurally because `applyCoercion` only needs `{ pos: number }`,
but Topaz's exact anonymous-class subset treats those richer expression shapes
as distinct from the helper's minimal diagnostic-anchor shape.

## Decision

Give `emitWithExpected` one explicit `{ pos: number }` local and pass it to the
contextual `applyCoercion` calls in that method. This keeps `applyCoercion`'s
minimal anchor API and preserves all contextual coercion behavior. Rejected
alternatives: widening `applyCoercion` to expression nodes was rejected because
the helper only needs source positions; adding anonymous-object structural
subtyping was rejected as a broader language decision; sweeping every diagnostic
anchor in `emitWithExpected` was rejected because this phase targets the visible
`applyCoercion` anchor cluster.

## Implementation

- `src/codegen.ts:10769` now creates a single explicit `exprAnchor` local at the
  start of `emitWithExpected`.
- `src/codegen.ts:10792`, `src/codegen.ts:10834`,
  `src/codegen.ts:10858`, `src/codegen.ts:10916`, and
  `src/codegen.ts:11002` now pass that local to `applyCoercion` instead of the
  richer expression variant.
- The existing contextual `undefined` emission paths in `emitWithExpected` also
  reuse the same local anchor.

## Consequences

- **Accepted**: generated C, diagnostics, arrow contextual coercion, `new`
  contextual coercion, optional object-literal widening, class-to-dunion object
  literal coercion, and fallback coercion stay unchanged.
- **Rejected**: `applyCoercion`'s signature and broader exact
  anonymous-class compatibility are unchanged.
- **Regression**: no examples were added because this is a self-host source
  cleanup with no intended observable behavior change.
- **Self-host**: the old `src/codegen.ts:10792:56` exact anonymous-class blocker
  is removed; the next probe blocker should be recorded by the worker outcome.
- **Scope out**: broader diagnostic-anchor cleanup and anonymous-object
  structural subtyping remain separate decisions.
