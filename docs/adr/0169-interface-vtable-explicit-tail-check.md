# 0169. interface vtable explicit tail check (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0168](./0168-class-member-emission-cleanup.md) moved the full graph self-host
probe to `src/codegen.ts:3459`, where `emitInterfaceVtableStruct` used
`tail ? ... : ...` to decide whether to append method parameters after
`void *self`. `tail` is a string, and Topaz conditions require strict
`boolean`.

## Decision

Use `tail.length > 0` for the interface vtable method parameter-list branch.

Rejected alternative: supporting string truthiness would broaden Topaz
semantics and is unnecessary for this formatting helper.

## Implementation

- `src/codegen.ts:3459` checks `tail.length > 0` instead of string truthiness.

## Consequences

- **Accepted**: interface vtable signature formatting stays within strict
  boolean conditions.
- **Rejected**: no string truthiness is added.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe.
