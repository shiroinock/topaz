# 0245 - ternary narrowing helper cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0244](./0244-expression-fallback-unsupported-anchors.md) advanced the
self-host probe to `src/codegen.ts:7362:10: type mismatch: expected
topaz_boolean, got topaz_union_class_anon_124_or_undefined`. The blocker was
inside `Emitter.underNarrowingString`, where the optional narrowing parameter
was tested with `if (!n)`. `Emitter.underNarrowingType` had the same optional
truthiness shape, and both helpers used local `try/finally` to restore scope.

Ternary semantics were already fixed by [0012](./0012-ternary-expression.md):
the condition is strict boolean, true and false arms run under polarity-specific
narrowing, and branch values still converge through `emitWithExpected` and
`conditionalResultType`.

## Decision

Keep ternary behavior unchanged, but normalize the two local helper
implementations to the current self-host subset. `underNarrowingString` and
`underNarrowingType` now use explicit `n === undefined` checks, then perform
normal-path `scope.push()`, `scope.narrow(...)`, callback evaluation,
`scope.pop()`, and return.

Rejected alternatives: broadening optional truthiness was rejected because
conditions remain strict boolean in this subset. Changing ternary branch
convergence was rejected because ADR 0012 already fixed the accepted behavior.
Sweeping unrelated narrowing helpers was rejected because this phase only owns
the two ternary helper implementations.

## Implementation

- `src/codegen.ts:7358`: `underNarrowingString` now treats absent narrowing via
  `n === undefined` and restores the pushed scope on the normal path.
- `src/codegen.ts:7370`: `underNarrowingType` uses the same subset-friendly
  optional check and normal-path scope restoration.

## Consequences

- **Accepted**: ternary conditions, narrowing propagation, expected-type
  emission, and branch type convergence are unchanged.
- **Rejected**: incompatible ternary branches still fail, non-boolean ternary
  conditions still fail, and optional truthiness remains unsupported.
- **Regression**: no examples were added because observable behavior is
  unchanged; existing ternary and IIFE narrowing coverage continues to exercise
  the behavior.
- **Self-host**: the old `src/codegen.ts:7362:10` blocker is resolved. The
  probe now stops at `src/codegen.ts:7423:7: type mismatch: expected
  topaz_class_anon_88, got topaz_class_anon_26`, in ternary branch convergence.
- **Scope out**: `emitConditional`, `conditionalResultType`,
  `extractNarrowing`, carry narrowing, parser, AST, and runtime are unchanged.
