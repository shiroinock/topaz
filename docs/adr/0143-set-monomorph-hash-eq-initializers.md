# 0143. set monomorph hash eq initializers (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0142](./0142-map-monomorph-internal-error.md) moved the full graph self-host
probe to `src/codegen.ts:2851`, where `emitSetMonomorphMacro` declared `hashFn`
without an initializer before assigning it in element-kind branches. The adjacent
`eqFn` local follows the same pattern. Topaz requires initialized `let`
declarations.

## Decision

Initialize both `hashFn` and `eqFn` to the empty string and keep the existing
branch assignments.

Rejected alternative: relaxing initialized declaration requirements would change
the language subset and is unnecessary for this compiler-source cleanup.

## Implementation

- `src/codegen.ts:2851` initializes `hashFn` to `""`.
- `src/codegen.ts:2852` initializes `eqFn` to `""`.

## Consequences

- **Accepted**: set monomorph macro emission stays within the initialized-let
  subset.
- **Rejected**: no uninitialized `let` support is added.
- **Regression**: no new example was added because uninitialized declarations are
  already covered as unsupported and this is a compiler-source cleanup exercised
  by the full graph probe.
