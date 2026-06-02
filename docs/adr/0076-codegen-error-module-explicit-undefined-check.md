# 0076. CodegenError module explicit undefined check (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0075](./0075-cli-format-source-error-indexed-non-null-cleanup.md) moved the
full graph self-host probe to `src/codegen.ts:664`, where the `CodegenError`
constructor used `if (module)` on `SourceModule | undefined`. Topaz conditions
must be strict `boolean`; JS truthy/falsy narrowing is intentionally outside the
subset.

## Decision

Change the guard to `module !== undefined`, preserving the existing diagnostic
path while making the condition an explicit boolean.

Rejected alternatives: adding truthy/falsy condition semantics would contradict
the documented divergence; changing global module state ownership is larger
than this self-host blocker.

## Implementation

- `src/codegen.ts:664` changes `if (module)` to `if (module !== undefined)`.

## Consequences

- **Accepted**: formatted `CodegenError` messages are unchanged when a current
  module exists.
- **Rejected**: no truthy/falsy condition support is added.
- **Regression**: no new example was added because behavior is unchanged and
  the full graph self-host probe covers this compiler-source cleanup.
