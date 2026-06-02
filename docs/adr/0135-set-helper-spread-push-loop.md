# 0135. set helper spread push loop (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0134](./0134-monomorph-scope-restore-without-finally.md) moved the full graph
self-host probe to `src/codegen.ts:2566`, where set helper emission used spread
in call arguments. Topaz intentionally rejects spread call arguments and points
callers to explicit loops.

## Decision

Replace `helperLines.push(...this.emitSetElemHelpers(elem))` with a local helper
array and a `for-of` loop that pushes each line.

Rejected alternative: adding spread-call lowering would expand the language
surface and is unnecessary for this compiler-source cleanup.

## Implementation

- `src/codegen.ts:2566` stores `emitSetElemHelpers(elem)` in `elemHelpers`.
- `src/codegen.ts:2567` appends each helper line with `helperLines.push(line)`.

## Consequences

- **Accepted**: set helper emission stays in the supported subset.
- **Rejected**: no spread-call support is added.
- **Regression**: no new example was added because spread-call rejection is
  already covered and this is a compiler-source cleanup exercised by the full
  graph probe.
