# 0071. CLI usage function (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0070](./0070-lower-hex-formatting-helper.md) moved the full graph self-host
probe to `src/cli.ts:88`, where `main` referenced the module-level `USAGE`
constant. The current self-host subset did not resolve that top-level constant
in this CLI path.

## Decision

Replace `USAGE` with a zero-argument `usageText()` function returning the same
template literal, and call it at the two display sites.

Rejected alternatives: broadening module-const handling here would be a
compiler feature change; duplicating the usage literal at both call sites would
invite drift.

## Implementation

- `src/cli.ts:12` changes `USAGE` from a top-level constant to
  `usageText(): string`.
- `src/cli.ts:90` and `src/cli.ts:94` call `usageText()` for help and missing
  input output.

## Consequences

- **Accepted**: CLI usage text is unchanged.
- **Rejected**: no new module-constant lowering behavior is added.
- **Regression**: no new example was added because CLI smoke cases already
  cover help/missing input behavior and the full graph self-host probe covers
  this compiler-source cleanup.
