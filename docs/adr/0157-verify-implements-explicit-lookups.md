# 0157. verify implements explicit lookups (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0156](./0156-definite-assignment-target-switch.md) moved the full graph
self-host probe to `src/codegen.ts:3139`, where `verifyImplements` used
`if (!got)` after a `Map.get` for interface field conformance. The method
conformance path has the same optional lookup pattern. Topaz requires strict
boolean conditions and does not use truthy/falsy narrowing for optional values.

## Decision

Use `got === undefined` for both field and method lookups, and keep the
subsequent type/signature comparison in the `else` branch where `got` is present.

Rejected alternative: adding truthy/falsy optional checks would change the
language subset and is unnecessary for this compiler-source cleanup.

## Implementation

- `src/codegen.ts:3139` checks field lookup absence with `got === undefined`.
- `src/codegen.ts:3145` compares field types in the present branch.
- `src/codegen.ts:3155` checks method lookup absence with `got === undefined`.
- `src/codegen.ts:3161` compares method signatures in the present branch.

## Consequences

- **Accepted**: interface conformance verification stays within strict boolean
  optional handling.
- **Rejected**: no truthy/falsy optional narrowing is added.
- **Regression**: no new example was added because strict boolean conditions are
  already covered and this is a compiler-source cleanup exercised by the full
  graph probe.
