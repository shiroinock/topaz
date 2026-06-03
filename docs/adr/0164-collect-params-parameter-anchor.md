# 0164. collectParams parameter anchor (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0163](./0163-class-method-member-anchor.md) moved the full graph self-host
probe to `src/codegen.ts:3260`, where `collectParams` passed a full
`FunctionParam` to `typeFromAnnotation`. The next line used the same full
parameter object as the `assertNotVoid` anchor. Both helpers accept the exact
`{ pos: number }` anchor shape.

## Decision

Create a per-parameter `paramAnchor` from `p.pos` and use it for both parameter
type annotation handling and the `void` parameter type diagnostic.

Rejected alternative: accepting arbitrary parameter-shaped objects as anchors
would broaden exact object matching and repeat the same issue at later call
sites.

## Implementation

- `src/codegen.ts:3260` creates `paramAnchor`.
- `src/codegen.ts:3261` passes `paramAnchor` to `typeFromAnnotation`.
- `src/codegen.ts:3262` passes `paramAnchor` to `assertNotVoid`.

## Consequences

- **Accepted**: function, method, constructor, and interface method parameter
  collection all use the same minimal anchor contract through `collectParams`.
- **Rejected**: no structural anchor widening is added.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe.
