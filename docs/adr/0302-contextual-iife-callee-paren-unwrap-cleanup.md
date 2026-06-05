# 0302 - contextual IIFE callee paren unwrap cleanup

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 1.5-6i prep

## Context

[0015](./0015-iife-contextual-return.md) fixed contextual IIFE semantics:
`emitWithExpected` supplies the expected return type to parenthesized arrow
IIFEs whose arrow lacks an explicit return annotation. After phase 268, the
self-host probe advanced to `src/codegen.ts:11000:53`, where the contextual
IIFE branch stripped parenthesized callees with a reassigned local in
`while (callee.kind === "paren_expr") callee = callee.inner`. The current
Topaz subset does not carry discriminated-union narrowing through that loop
shape, so the self-host source needed a narrower cleanup without changing IIFE
behavior.

## Decision

Factor parenthesized-expression stripping into a small recursive helper that
uses direct `if (expr.kind === "paren_expr")` narrowing at each recursive step,
then call it from the contextual IIFE branch before checking for an unannotated
arrow callee. Rejected alternatives: a single-level `if` unwrap was rejected
because it would silently stop accepting multiple paren layers around an arrow
IIFE; general loop-carried discriminated-union narrowing was rejected as a
larger language/compiler feature decision; reworking contextual IIFE inference
was rejected because ADR 0015 already settled the expected-type based design.

## Implementation

- `src/codegen.ts:10769` adds `unwrapParenExpr(expr)`, returning recursively on
  `paren_expr.inner` and returning the original expression otherwise.
- `src/codegen.ts:11004` now binds contextual IIFE `callee` from
  `this.unwrapParenExpr(expr.callee)` instead of mutating a narrowed local in a
  `while` loop.
- `src/codegen.ts:11005` keeps the existing `arrow_expr` plus missing
  `returnType` gate before calling `emitContextualIIFE`, so annotated arrows
  and non-IIFE calls continue to use the normal call path.

## Consequences

- **Accepted**: one or more parenthesis layers around contextual arrow IIFEs
  continue to route through `emitContextualIIFE` when an expected type exists.
- **Rejected**: block-body return inference without a contextual expected type
  remains unsupported, and non-contextual IIFE inference is unchanged.
- **Regression**: no examples were added because this is a self-host source
  cleanup preserving existing behavior; `iife_contextual_return` and
  `iife_no_context_fail` continue to cover the observable surface.
- **Self-host**: the old `src/codegen.ts:11000:53` loop-carried narrowing
  blocker is removed. The next probe blocker is `src/codegen.ts:11005:44`,
  where `!callee.returnType` needs a later cleanup.
- **Scope out**: broader loop-carried narrowing and contextual IIFE semantic
  changes remain separate decisions.
