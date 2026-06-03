# 0270 - fn value call diagnostic anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0269](./0269-function-signature-optional-presence-cleanup.md) advanced the
self-host probe to `src/codegen.ts:8136:17`. The reached blocker was the
fn-value call-target fallback: emit-side and infer-side diagnostics passed a
full expression union into `unsupported`, while the self-host subset only needs
the source kind and position. Adjacent fn-value arity and contextual IIFE spread
diagnostics also still anchored on full call/spread expressions.

## Decision

Preserve fn-value call behavior and normalize the local call-target diagnostic
anchors to explicit source-position records. `unsupported` receives `{ kind,
pos }` for non-fn call targets, while adjacent fn-value arity and contextual
IIFE spread errors receive `{ pos }`. Rejected alternatives: broadening
`unsupported` to accept arbitrary expression unions was rejected because it only
needs `kind` and `pos`; adding new fn-call or spread-call support was rejected
as unrelated; sweeping all call argument diagnostics was rejected as broader
than the reached fn-value/call-target blocker.

## Implementation

- `src/codegen.ts:8136`: emit-side non-fn call-target fallback now passes an
  explicit `{ kind, pos }` anchor to `unsupported`.
- `src/codegen.ts:8150`: fn-value arity errors now anchor on the call position
  without passing the full call expression.
- `src/codegen.ts:8185`: contextual IIFE spread-in-call rejection now anchors
  on the spread argument position.
- `src/codegen.ts:10272`: infer-side non-fn call-target fallback now mirrors
  the emit-side `{ kind, pos }` anchor.

## Consequences

- **Accepted**: fn-typed local calls, expression-typed fn calls, and contextual
  IIFE dispatch keep the same fat-pointer lowering.
- **Rejected**: non-fn call targets and unsupported spread call arguments remain
  rejected with the existing messages.
- **Regression**: no examples were added because observable behavior is
  unchanged; build, self-host probe, and smoke tests remain the guard.
- **Self-host**: the old `src/codegen.ts:8136:17` full-expression call-target
  blocker is removed. The next probe blocker is recorded in the phase outcome.
- **Scope out**: broader fn-value argument-index cleanup and wider spread-call
  support remain for later phases if reached.
