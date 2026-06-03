# 0155. definite field init ctor local (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0154](./0154-verify-implements-call-anchor.md) moved the full graph self-host
probe to `src/codegen.ts:3079`, where `verifyDefiniteFieldInit` used
`!info.ctor` as an optional-value condition. The same function later used
`info.ctor.decl` as another optional truthy check and as a diagnostic anchor.

## Decision

Store `info.ctor` in a local, return if it is `undefined`, then use
`ctorDecl !== undefined` for constructor-body analysis. Build an explicit
`{ pos: number }` diagnostic anchor from either the constructor declaration or
the class declaration.

Rejected alternative: adding truthy/falsy optional narrowing would change the
language subset and is unnecessary for this compiler-source cleanup.

## Implementation

- `src/codegen.ts:3079` stores `info.ctor` in `ctor`.
- `src/codegen.ts:3080` checks `ctor === undefined`.
- `src/codegen.ts:3087` uses `ctorDecl !== undefined`.
- `src/codegen.ts:3095` builds an explicit `{ pos: number }` diagnostic anchor.

## Consequences

- **Accepted**: definite field initialization verification avoids optional
  truthy/falsy checks and full-object diagnostic anchors.
- **Rejected**: no broader optional truthiness support is added.
- **Regression**: no new example was added because strict boolean conditions are
  already covered and this is a compiler-source cleanup exercised by the full
  graph probe.
