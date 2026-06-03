# 0161. class field initializer local narrowing (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0160](./0160-class-field-member-anchor.md) moved the full graph self-host probe
to `src/codegen.ts:3219`, where `collectField` used `if (m.initializer)` to
test an `Expr | undefined` class-field initializer. Topaz conditions are strict
`boolean`; optional values must be checked explicitly.

## Decision

Store `m.initializer` in a local variable, compare the local with
`!== undefined`, and write the narrowed initializer local into `fieldInits`.

Rejected alternative: adding truthy/falsy checks for optional expressions would
broaden the language subset and is unnecessary for this source cleanup.

## Implementation

- `src/codegen.ts:3219` copies `m.initializer` into `initializer`.
- `src/codegen.ts:3220` checks `initializer !== undefined`.
- `src/codegen.ts:3221` stores the narrowed initializer local.

## Consequences

- **Accepted**: class field initializer collection uses explicit optional
  narrowing.
- **Rejected**: property truthiness and optional truthiness remain unsupported.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe.
