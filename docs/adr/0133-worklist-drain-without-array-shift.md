# 0133. worklist drain without Array.shift (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0132](./0132-function-return-annotation-anchor.md) moved the full graph
self-host probe to `src/codegen.ts:2446`, where the monomorph worklist drain used
`Array<string>.shift()`. Topaz already supports indexed array reads and
`Array.pop()`, and the worklists are internal compiler queues whose order is not
user-visible program behavior.

Adding `Array.shift()` would require a new array method contract, lowering, and
regression coverage. That is larger than needed to keep the self-hosting prep
moving.

## Decision

Drain `classMonomorphWorklist` and `genericWorklist` from the end using indexed
read plus `.pop()`. Keep `Array.shift()` unsupported for now.

Rejected alternative: implement `Array.shift()` as a public language feature in
this prep step. It can be added later with an explicit method contract and tests
if user programs need it.

## Implementation

- `src/codegen.ts:2446` reads the last class monomorph worklist item and pops it.
- `src/codegen.ts:2467` reads the last generic worklist item and pops it.

## Consequences

- **Accepted**: self-host prep avoids expanding the public Array method surface.
- **Accepted**: monomorph emission may use LIFO worklist order, but forward and
  definition slots still preserve dependency availability.
- **Rejected**: no `Array.shift()` support is introduced.
- **Regression**: no new example was added because this is a compiler-source
  cleanup exercised by the full graph probe.
