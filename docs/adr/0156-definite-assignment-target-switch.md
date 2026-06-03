# 0156. definite assignment target switch (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0155](./0155-definite-field-init-ctor-local.md) moved the full graph self-host
probe to `src/codegen.ts:3116`, where `collectDefiniteFieldAssignments` accessed
`e.target.receiver` after an early negative kind check. Topaz's current
discriminated-union field narrowing requires a `switch (x.kind)` shape for
variant-specific fields.

## Decision

Store the assignment target in a local, switch on `target.kind`, and inspect
`receiver` / `name` only inside the `"prop_access"` case.

Rejected alternative: expanding narrowing to understand all early-continue guard
forms would be a broader type-flow feature and is unnecessary for this
self-hosting cleanup.

## Implementation

- `src/codegen.ts:3115` stores `e.target` in `target`.
- `src/codegen.ts:3116` switches on `target.kind`.
- `src/codegen.ts:3118` records `target.name` only after the `"prop_access"`
  narrowing.

## Consequences

- **Accepted**: definite field assignment collection uses the currently
  supported switch narrowing form.
- **Rejected**: no broader early-continue narrowing support is added.
- **Regression**: no new example was added because switch narrowing is already
  covered and this is a compiler-source cleanup exercised by the full graph
  probe.
