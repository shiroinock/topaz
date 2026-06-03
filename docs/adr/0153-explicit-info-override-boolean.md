# 0153. explicit info override boolean (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0152](./0152-class-constructor-existence-boolean.md) moved the full graph
self-host probe to `src/codegen.ts:3067`, where `collectClassMembers` used
`!infoOverride` to decide whether to run strict field initialization checks.
Topaz requires strict boolean conditions and does not use truthy/falsy narrowing
for optional values.

## Decision

Compute `hasInfoOverride` with `infoOverride !== undefined` and use that boolean
in the condition.

Rejected alternative: adding truthy/falsy optional checks would change the
language subset and is unnecessary for this compiler-source cleanup.

## Implementation

- `src/codegen.ts:3067` computes `hasInfoOverride` explicitly.
- `src/codegen.ts:3068` uses `!hasInfoOverride` in the strict field init gate.

## Consequences

- **Accepted**: generic class monomorph detection stays within strict boolean
  conditions.
- **Rejected**: no truthy/falsy optional narrowing is added.
- **Regression**: no new example was added because strict boolean conditions are
  already covered and this is a compiler-source cleanup exercised by the full
  graph probe.
