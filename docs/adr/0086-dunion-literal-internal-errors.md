# 0086. dunionLiteralFor internal errors (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0085](./0085-discriminated-union-explicit-checks.md) moved the full graph
self-host probe to `src/codegen.ts:1402`, where `dunionLiteralFor` threw
`new Error(...)` for internal invariant failures. The current subset does not
support arbitrary `Error` construction, and this helper is compiler-internal.

## Decision

Replace `new Error(...)` with `throwInternalCodegenError(...)` and make class
and field lookup checks explicit with `!== undefined`.

Rejected alternatives: adding `Error` construction support is runtime/library
work; using `CodegenError` would imply a source-anchor diagnostic where this
helper is reporting an internal invariant.

## Implementation

- `src/codegen.ts:1402` replaces the non-dunion error.
- `src/codegen.ts:1405` rewrites class lookup to an explicit undefined check.
- `src/codegen.ts:1408` rewrites field lookup and kind validation explicitly.

## Consequences

- **Accepted**: invariant failures still abort through the compiler's internal
  error path.
- **Rejected**: no `new Error` support is added.
- **Regression**: no new example was added because this is compiler-source
  cleanup covered by the full graph self-host probe.
