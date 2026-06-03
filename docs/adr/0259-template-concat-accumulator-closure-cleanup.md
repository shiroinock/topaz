# 0259 - template concat accumulator closure cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0258](./0258-template-substitution-diagnostic-anchors.md) advanced the
self-host probe to `src/codegen.ts:7825:7`. Template literal lowering used a
local `append` arrow that mutated the outer `acc` accumulator. That source shape
requires closure capture of a mutable local even though template concatenation
itself only needs an explicit accumulator update.

## Decision

Preserve template literal semantics and express concat accumulation through a
non-capturing helper plus explicit assignments at each append site. Rejected
alternatives: broadening closure capture support was rejected because this
compiler-source helper does not need closure semantics and closure feature work
is much larger than this blocker; inlining each concat expression manually was
rejected because a helper keeps the left-associative concat rule in one place;
changing template substitution acceptance or stringification was rejected as
unrelated behavior work.

## Implementation

- `src/codegen.ts:7800`: `appendTemplatePiece` now returns either the first
  emitted piece or a left-associative `topaz_string_concat(current, piece)`.
- `src/codegen.ts:7827`: `emitTemplateExpression` keeps the same `acc:
  string | undefined` accumulator without declaring a local mutating closure.
- `src/codegen.ts:7829`: head, substitution, and cooked-tail append sites now
  assign `acc = this.appendTemplatePiece(acc, piece)` explicitly while keeping
  empty-fragment skipping.

## Consequences

- **Accepted**: template literal lowering remains left-associative
  `topaz_string_concat`; `${number}`, `${boolean}`, and `${string}`
  substitutions keep their existing stringification.
- **Rejected**: class, interface, collection, and union substitutions remain
  rejected by the existing diagnostics.
- **Regression**: no examples were added because observable behavior is
  unchanged; existing build, self-host probe, and smoke tests remain the guard.
- **Self-host**: the old `src/codegen.ts:7825:7` mutable-capture blocker is
  removed. The next blocker is recorded in the phase outcome JSON.
- **Scope out**: closure feature work and broader template literal policy
  changes remain outside this phase.
