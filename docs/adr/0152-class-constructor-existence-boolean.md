# 0152. class constructor existence boolean (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0151](./0151-class-modifier-diagnostic-mapping.md) moved the full graph
self-host probe to `src/codegen.ts:3037`, where `collectClassMembers` used
`!info.ctor` in a condition. Topaz requires strict boolean conditions and does
not use truthy/falsy narrowing for optional values.

The same missing-constructor block also passed the full class declaration to
`CodegenError`.

## Decision

Compute `hasCtor` with `info.ctor !== undefined` and use `!hasCtor` in the
condition. Use the existing `clsAnchor` for the missing-constructor diagnostic.

Rejected alternative: adding truthy/falsy optional checks would change the
language subset and is unnecessary for this compiler-source cleanup.

## Implementation

- `src/codegen.ts:3037` computes `hasCtor` explicitly.
- `src/codegen.ts:3038` uses `!hasCtor` in the field/constructor condition.
- `src/codegen.ts:3054` uses `clsAnchor` for the missing-constructor diagnostic.

## Consequences

- **Accepted**: class member collection stays within strict boolean conditions.
- **Rejected**: no truthy/falsy optional narrowing is added.
- **Regression**: no new example was added because strict boolean conditions are
  already covered and this is a compiler-source cleanup exercised by the full
  graph probe.
