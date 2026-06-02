# 0075. CLI formatSourceError indexed non-null cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0074](./0074-cli-output-local-narrowing.md) moved the full graph self-host
probe to `src/cli.ts:207`, where `formatSourceError` used non-null assertions
after array indexed reads. Topaz array indexing returns the element type
directly, so these assertions are redundant and rejected.

## Decision

Read `lineStarts[i]` and `lineStarts[lineIndex]` directly. This follows the
same subset rule and cleanup pattern as [0066](./0066-pos-to-line-col-indexed-non-null-cleanup.md).

Rejected alternatives: changing array indexing to return `T | undefined` is a
broad language/runtime decision; allowing redundant non-null assertions would
weaken a correct subset check.

## Implementation

- `src/cli.ts:207` removes the non-null assertion from the loop read.
- `src/cli.ts:210` removes the non-null assertion from the final line-start
  read.

## Consequences

- **Accepted**: CLI source-error line/column formatting is unchanged.
- **Rejected**: array indexing and non-null assertion rules are unchanged.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
