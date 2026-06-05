# 0296 - undefined literal anchor cleanup

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 1.5-6i prep

## Context

[0293](./0293-nullish-coalesce-anchor-annotation.md) kept diagnostic anchors
inside the self-host subset by giving local `{ pos: number }` object literals an
explicit contextual shape. After phase 262, the self-host probe reached
`src/codegen.ts:10773:50`, where `emitWithExpected` still passed a narrowed
expression node directly to `emitUndefinedLiteral`. TypeScript accepts that
structurally, but Topaz's exact anonymous-class matching treats expression-node
shapes and minimal diagnostic anchors as different anonymous classes.

## Decision

Introduce explicit `{ pos: number }` anchor locals at the `emitUndefinedLiteral`
call boundaries in `emitWithExpected`. This preserves the helper's minimal
diagnostic-anchor API and keeps contextual `undefined` lowering unchanged.
Rejected alternatives: widening `emitUndefinedLiteral` to accept expression
nodes was rejected because the helper only needs source positions; adding
broader anonymous-object structural assignability was rejected as a language
semantics decision; sweeping unrelated anchor sites was rejected because this
phase only addresses the visible `emitUndefinedLiteral` raw-expression cluster.

## Implementation

- `src/codegen.ts:10773` now wraps the contextual `undefined` expression's
  source position in an explicit `{ pos: number }` local before calling
  `emitUndefinedLiteral`.
- `src/codegen.ts:10975` now uses the same explicit anchor shape when an
  object literal omits an optional anonymous-class field and the missing slot is
  auto-filled with `undefined`.

## Consequences

- **Accepted**: generated C and diagnostic source locations for contextual
  `undefined` emission stay unchanged.
- **Rejected**: object-literal optional-field semantics and
  `emitUndefinedLiteral`'s signature are unchanged.
- **Regression**: no examples were added because this is a self-host source
  cleanup with no intended observable behavior change.
- **Self-host**: the old `src/codegen.ts:10773:50` exact anonymous-class blocker
  is removed; the probe now reaches `src/codegen.ts:10792:56` on a later
  anonymous-class type mismatch.
- **Scope out**: broader anonymous-object structural subtyping and unrelated
  diagnostic-anchor cleanup remain separate decisions.
