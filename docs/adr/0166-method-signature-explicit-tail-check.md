# 0166. method signature explicit tail check (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0165](./0165-thread-present-constructor-info.md) moved the full graph
self-host probe to `src/codegen.ts:3327`, where `methodSignature` used
`tail ? ... : ...` to decide whether to append method parameters after the
receiver argument. `tail` is a string, and Topaz conditions require strict
`boolean`.

## Decision

Use `tail.length > 0` for the parameter-list branch.

Rejected alternative: supporting string truthiness would broaden Topaz
semantics and is unnecessary for this codegen formatting helper.

## Implementation

- `src/codegen.ts:3327` checks `tail.length > 0` instead of string truthiness.

## Consequences

- **Accepted**: method signature formatting stays within strict boolean
  conditions.
- **Rejected**: no string truthiness is added.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe.
