# 0110. resolveFunctionSig explicit module check (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0109](./0109-function-signature-internal-error-helper.md) moved the full graph
self-host probe to `src/codegen.ts:1928`, where `resolveFunctionSig` used
`if (current)` for a `SourceModule | undefined` value. Topaz requires strict
boolean conditions and does not perform truthy/falsy narrowing.

## Decision

Use `current !== undefined` for the ambient module check. This preserves the
existing branch behavior while making the narrowing explicit in Topaz's subset.

Rejected alternative: adding truthy/falsy conditions would change the language
subset and is unnecessary for this compiler-source cleanup.

## Implementation

- `src/codegen.ts:1928` replaces `if (current)` with
  `if (current !== undefined)`.

## Consequences

- **Accepted**: `resolveFunctionSig` narrows the ambient module explicitly.
- **Rejected**: no truthy/falsy condition support is added.
- **Regression**: no new example was added because strict boolean conditions are
  already covered by existing tests and the full graph probe covers this source
  cleanup.
