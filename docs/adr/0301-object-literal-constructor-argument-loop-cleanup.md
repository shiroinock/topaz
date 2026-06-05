# 0301 - object-literal constructor argument loop cleanup

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 1.5-6i prep

## Context

[0300](./0300-object-literal-field-collection-branch-locals.md) removed the
field-collection branch-local blocker. After phase 267, the self-host probe
advanced to `src/codegen.ts:10978:40`, where object-literal constructor
argument emission used `info.fieldOrder.map((f) => { ... })`. The callback body
returned the emitted argument strings correctly, but Topaz intentionally rejects
block-bodied arrow callbacks that lack explicit return type annotations.

## Decision

Replace the block-bodied `.map` callback with an initialized `string[]` and a
straightforward `for...of` loop over `info.fieldOrder`, preserving field lookup,
present-field `emitWithExpected`, missing-optional `emitUndefinedLiteral`, and
final constructor call ordering. Rejected alternatives: adding return inference
for block-bodied callbacks was rejected because that is a language feature
decision with existing fail coverage; annotating the callback return type was
rejected because it would still keep an avoidable contextual-callback shape in
the compiler source; changing object-literal argument ordering or optional
field filling was rejected because those semantics are unrelated.

## Implementation

- `src/codegen.ts:10978` initializes `args: string[]` before argument emission.
- `src/codegen.ts:10979` iterates over `info.fieldOrder` so constructor
  argument ordering remains field-order based.
- `src/codegen.ts:10982` pushes `emitWithExpected(v, fty)` for present fields
  and `emitUndefinedLiteral(fty, exprAnchor)` for missing optional slots.
- `src/codegen.ts:10988` keeps the existing
  `topaz_class_${className}_new(${args.join(", ")})` call shape.

## Consequences

- **Accepted**: object-literal constructor arguments are still emitted in
  `info.fieldOrder`, with present fields coerced through `emitWithExpected`.
- **Rejected**: block-bodied arrow callbacks without explicit return type
  annotations remain unsupported.
- **Regression**: no examples were added because this is a self-host source
  cleanup with no intended observable behavior change.
- **Self-host**: the old `src/codegen.ts:10978:40` block-bodied callback
  blocker is removed; the next probe blocker should be recorded by the worker
  outcome.
- **Scope out**: broader callback return inference and object-literal semantic
  changes remain separate decisions.
