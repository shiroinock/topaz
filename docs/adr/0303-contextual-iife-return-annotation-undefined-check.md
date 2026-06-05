# 0303 - contextual IIFE return annotation undefined check

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 1.5-6i prep

## Context

[0015](./0015-iife-contextual-return.md) fixed contextual IIFE semantics:
`emitWithExpected` supplies the expected return type to parenthesized arrow
IIFEs whose arrow lacks an explicit return annotation. After phase 269, the
self-host probe advanced to `src/codegen.ts:11005:44`, where the contextual
IIFE branch used `!callee.returnType` to detect a missing annotation. The
operand is `TypeNode | undefined`, and Topaz keeps conditions strictly
boolean, so the source needed an explicit undefined comparison without changing
contextual IIFE behavior.

## Decision

Keep the existing contextual IIFE gate but replace the truthiness check with
`callee.returnType === undefined`. Rejected alternatives: loosening optional
truthiness was rejected because strict boolean conditions are a core Topaz
subset rule; changing contextual IIFE behavior was rejected because ADR 0015
already fixes the semantics; sweeping other `!` conditions was rejected because
this phase owns only the visible return-annotation blocker.

## Implementation

- `src/codegen.ts:11005` now checks the unwrapped arrow callee's `returnType`
  with `=== undefined` before calling `emitContextualIIFE`.
- The surrounding `arrow_expr` and non-optional call checks are unchanged, so
  annotated arrows and non-IIFE calls continue to fall through to the normal
  call path.

## Consequences

- **Accepted**: arrows without explicit return annotations still route through
  `emitContextualIIFE` when an expected type exists.
- **Rejected**: arrows with explicit return annotations still fall through to
  normal call handling; optional truthiness remains unsupported.
- **Regression**: no examples were added because this preserves existing
  behavior; `iife_contextual_return` and `iife_no_context_fail` continue to
  cover the observable surface.
- **Self-host**: the old `src/codegen.ts:11005:44` strict-boolean blocker is
  removed. The next blocker is `src/cli.ts:220:22`, where `instanceof Error`
  needs concrete-class support or a source cleanup.
- **Scope out**: non-contextual block-body return inference, general
  `inferType(CallExpression)` changes, and broad truthiness semantics remain
  separate decisions.
