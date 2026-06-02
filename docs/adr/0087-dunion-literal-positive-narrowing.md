# 0087. dunionLiteralFor positive narrowing (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0086](./0086-dunion-literal-internal-errors.md) moved the full graph self-host
probe to `src/codegen.ts:1406`, where `dunionLiteralFor` used lookup results
after early internal-error guards. The current self-host flow did not narrow
those locals enough at the assignment site.

## Decision

Return the discriminator literal from inside positive lookup/kind branches and
leave a final `throwInternalCodegenError(...)` for unreachable malformed class
metadata.

Rejected alternatives: broadening flow analysis for never-returning helpers is
compiler work; non-null assertions would keep feeding the cleanup queue.

## Implementation

- `src/codegen.ts:1404` handles `infoMaybe !== undefined` as the success branch.
- `src/codegen.ts:1407` handles `fieldMaybe !== undefined` and
  `fieldMaybe.kind === "string_literal"` as the return branch.
- `src/codegen.ts:1412` reports the malformed metadata fallback.

## Consequences

- **Accepted**: `dunionLiteralFor` behavior is unchanged for valid dunions.
- **Rejected**: no flow-analysis change is added.
- **Regression**: no new example was added because existing discriminated-union
  tests cover behavior, and the full graph self-host probe covers this
  compiler-source cleanup.
