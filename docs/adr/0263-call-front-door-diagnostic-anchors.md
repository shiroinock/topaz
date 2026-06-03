# 0263 - call front-door diagnostic anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0262](./0262-console-argument-diagnostic-anchors.md) advanced the self-host
probe to `src/codegen.ts:7942:9`. The reached blocker was the call front door's
optional-call diagnostic passing the full `CallExpr` to `CodegenError`. The
adjacent spread-in-call-arguments diagnostic, plus the infer-side optional-call
diagnostic, had the same anchor shape even though each diagnostic only needs a
source position.

## Decision

Preserve call semantics and normalize only the call front-door diagnostics to
explicit `{ pos }` anchors. Rejected alternatives: accepting `f?.()` optional
calls was rejected because optional call support remains out of scope; accepting
spread in call arguments was rejected because spread calls remain unsupported;
sweeping all built-in method-call diagnostics was rejected as too broad for this
reached self-host blocker.

## Implementation

- `src/codegen.ts:7942`: the emit-side optional-call rejection now uses
  `{ pos: expr.pos }` instead of the full call expression.
- `src/codegen.ts:7952`: the emit-side spread-in-call-arguments rejection now
  uses `{ pos: a.pos }` instead of the full spread expression.
- `src/codegen.ts:9977`: the infer-side optional-call rejection now uses
  `{ pos: expr.pos }` while preserving the optional method call path.

## Consequences

- **Accepted**: normal calls, built-in calls, `a?.b`, `a?.b()`, and `a?.[i]`
  continue to use the existing lowering and inference behavior.
- **Rejected**: `f?.()` optional calls remain unsupported.
- **Rejected**: spread in call arguments remains unsupported; array-literal
  spread support is unchanged.
- **Regression**: no examples were added because observable behavior and
  diagnostic messages are unchanged; build, self-host probe, and smoke tests
  remain the guard.
- **Self-host**: the old `src/codegen.ts:7942:9` anchor-shape blocker is
  removed. The next blocker is recorded in the phase outcome JSON.
- **Scope out**: broader method-call diagnostic-anchor cleanup remains for later
  phases.
