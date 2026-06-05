# 0298 - dunion object-literal optional local initialization

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 1.5-6i prep

## Context

[0297](./0297-applycoercion-anchor-cleanup.md) moved contextual coercion anchors
onto explicit diagnostic locals. After phase 264, the self-host probe advanced
to `src/codegen.ts:10870:9`, where the dunion object-literal contextual branch
declared optional sentinel locals without initializers. TypeScript implicitly
initializes such locals to `undefined`, but Topaz's subset requires every
`let` declaration to have an initializer.

## Decision

Initialize the dunion object-literal sentinel locals explicitly to `undefined`.
This preserves the existing discriminator lookup and matched-variant selection
logic while keeping the initialized-local subset rule intact. Rejected
alternatives: loosening the initialized-`let` rule was rejected because it is a
core subset boundary; extracting helper functions was rejected because this is
a pure source-shape cleanup; sweeping unrelated optional locals was rejected
because this phase only targets the two visible sentinel declarations in the
dunion contextual branch.

## Implementation

- `src/codegen.ts:10870` now initializes `kindProp` to `undefined` before the
  discriminator-property scan.
- `src/codegen.ts:10890` now initializes `matchedVariant` to `undefined` before
  the variant-selection scan.
- The existing `=== undefined` checks and `CodegenError` diagnostics remain
  unchanged.

## Consequences

- **Accepted**: dunion object-literal discriminator lookup and variant selection
  keep the same runtime behavior and diagnostics.
- **Rejected**: object-literal-to-dunion semantics and `let` initialization
  requirements are unchanged.
- **Regression**: no examples were added because this is a self-host source
  cleanup with no intended observable behavior change.
- **Self-host**: the old `src/codegen.ts:10870:9` uninitialized-local blocker is
  removed; the next probe blocker should be recorded by the worker outcome.
- **Scope out**: helper extraction, broader optional-local sweeps, and any
  change to object-literal-to-dunion lowering remain separate decisions.
