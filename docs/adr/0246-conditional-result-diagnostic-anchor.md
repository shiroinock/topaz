# 0246 - conditional result diagnostic anchor

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0245](./0245-ternary-narrowing-helper-cleanup.md) resolved the ternary
narrowing helper optional checks and advanced the self-host probe to
`src/codegen.ts:7423:7: type mismatch: expected topaz_class_anon_88, got
topaz_class_anon_26`. The remaining blocker was not ternary semantics; it was
the incompatible-branch diagnostic in `Emitter.conditionalResultType`, where a
full `TernaryExpr` object was passed to `CodegenError`.

Ternary behavior remains governed by [0012](./0012-ternary-expression.md):
conditions are strict boolean, both arms run under their polarity-specific
narrowing, contextual emission uses `emitWithExpected`, and contextless branch
types converge only through equal types, assignable widening, or bare
`undefined` lifting.

## Decision

Preserve ternary result typing and normalize only the incompatible-branch
diagnostic anchor to the current self-host-friendly `{ pos: expr.pos }` shape.
This keeps the error positioned at the start of the ternary expression while
avoiding a structural mismatch between the full `TernaryExpr` object and the
subset's expected diagnostic node shape.

Rejected alternatives: changing branch convergence was rejected because ADR
0012 already fixes the accepted forms. Adding a wider diagnostic-node
abstraction was rejected because surrounding migrations already use local
`{ pos: node.pos }` anchors. Synthesizing arbitrary unions for unrelated
branches was rejected as a language expansion outside this cleanup.

## Implementation

- `src/codegen.ts:7422`: the incompatible ternary branch `CodegenError` now
  receives `{ pos: expr.pos }` instead of the full ternary expression.
- No parser, runtime, narrowing, or `emitWithExpected` behavior changed.

## Consequences

- **Accepted**: strict-boolean ternaries, narrowing in both arms,
  expected-type coercion, assignable class-to-interface / dunion convergence,
  and bare-`undefined` branch lifting are unchanged.
- **Rejected**: contextless ternaries with incompatible branch types still fail
  with `conditional (?:) branches have incompatible types`.
- **Regression**: no examples were added because observable behavior is
  unchanged; existing `ternary`, `ternary_nonbool_cond_fail`, and
  `ternary_incompatible_branches_fail` coverage remains authoritative across
  the 280 smoke cases.
- **Self-host**: the old `src/codegen.ts:7423:7` blocker is resolved. The
  probe now stops at `src/codegen.ts:7443:5: variable declaration must have an
  initializer`, immediately after `conditionalResultType`.
- **Scope out**: array literal inference, future diagnostic abstractions, and
  any broader ternary result-type changes remain outside this phase.
