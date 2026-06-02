# 0115. module id values empty array annotation (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0114](./0114-module-id-modules-empty-array-annotation.md) moved the full graph
self-host probe to `src/codegen.ts:1948`, where `emit` assigned `[]` directly to
`this.moduleIdValues`. Topaz cannot infer the element type of an empty array
literal without a contextually typed target.

## Decision

Create an explicitly annotated `Array<string>` local initialized with `[]`, then
assign that local to `this.moduleIdValues`.

Rejected alternative: changing empty array literals to infer from assignment to
class fields would broaden expression inference and is unnecessary for this
compiler-source cleanup.

## Implementation

- `src/codegen.ts:1948` introduces `emptyModuleIdValues: Array<string> = []`.
- `src/codegen.ts:1949` assigns that local to `this.moduleIdValues`.

## Consequences

- **Accepted**: the reset remains behaviorally identical.
- **Rejected**: no empty-array inference changes are added.
- **Regression**: no new example was added because empty-array contextual typing
  is already covered by existing fail cases and the full graph probe covers this
  source cleanup.
