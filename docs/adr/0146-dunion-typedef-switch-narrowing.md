# 0146. dunion typedef switch narrowing (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0145](./0145-dunion-typedef-internal-error.md) moved the full graph self-host
probe to `src/codegen.ts:2880`, where `emitDunionTypedef` accessed
`t.discriminator` after an early negative kind check. Topaz's current
discriminated-union field narrowing requires a `switch (x.kind)` shape for
variant-specific fields.

## Decision

Rewrite `emitDunionTypedef` to switch on `t.kind`, return the typedef from the
`"dunion"` case, and use `throwInternalCodegenError` in the default case.

Rejected alternative: expanding narrowing to understand all early-throw guard
forms would be a broader type-flow feature and is unnecessary for this
self-hosting cleanup.

## Implementation

- `src/codegen.ts:2876` switches on `t.kind`.
- `src/codegen.ts:2878` reads `t.discriminator` only inside the `"dunion"` case.
- `src/codegen.ts:2881` keeps the non-dunion impossible state on the internal
  error channel.

## Consequences

- **Accepted**: dunion typedef emission uses the currently supported switch
  narrowing form.
- **Rejected**: no broader early-throw narrowing support is added.
- **Regression**: no new example was added because switch narrowing is already
  covered and this is a compiler-source cleanup exercised by the full graph
  probe.
