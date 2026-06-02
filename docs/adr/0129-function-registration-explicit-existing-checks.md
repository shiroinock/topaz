# 0129. function registration explicit existing checks (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0128](./0128-generic-alias-rejection-anchor.md) moved the full graph self-host
probe to `src/codegen.ts:2118`, where the function registration pass used
optional values directly in a boolean condition. Topaz requires strict boolean
conditions and does not perform truthy/falsy narrowing.

## Decision

Split the existing function and generic-function lookups into explicit boolean
locals using `!== undefined`, then use those booleans in the redeclaration
condition.

Rejected alternative: adding truthy/falsy conditions would change the language
subset and is unnecessary for this compiler-source cleanup.

## Implementation

- `src/codegen.ts:2117` stores the module-local signature lookup.
- `src/codegen.ts:2118` computes explicit boolean locals for existing concrete
  and generic functions.
- `src/codegen.ts:2120` uses those booleans in the redeclaration condition.

## Consequences

- **Accepted**: function registration no longer relies on truthy/falsy checks.
- **Rejected**: no truthy/falsy condition support is added.
- **Regression**: no new example was added because strict boolean conditions are
  already covered by existing tests and the full graph probe covers this source
  cleanup.
