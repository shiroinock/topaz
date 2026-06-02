# 0077. CodegenError message local narrowing (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0076](./0076-codegen-error-module-explicit-undefined-check.md) moved the full
graph self-host probe to `src/codegen.ts:666`, where optional constructor
parameter `message?: string` was interpolated directly into a template literal.
Topaz template literal substitutions accept `number`, `boolean`, or `string`,
not `string | undefined`.

## Decision

Normalize the optional parameter once with `const text = message ?? ""`, then
use `text` in both the formatted module-aware branch and the fallback branch.

Rejected alternatives: allowing optional values in template literals would
reintroduce JS coercion semantics; changing all call sites is noisier and does
not improve the constructor contract.

## Implementation

- `src/codegen.ts:663` adds `const text = message ?? ""`.
- `src/codegen.ts:667` interpolates `text`.
- `src/codegen.ts:669` assigns `text` in the no-module branch.

## Consequences

- **Accepted**: normal `CodegenError` messages are unchanged for the current
  call sites, which pass explicit strings.
- **Rejected**: no optional-to-string coercion is added to template literals.
- **Regression**: no new example was added because this is a compiler-source
  cleanup covered by the full graph self-host probe.
