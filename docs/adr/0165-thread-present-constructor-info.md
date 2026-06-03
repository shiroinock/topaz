# 0165. thread present constructor info (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0164](./0164-collect-params-parameter-anchor.md) moved the full graph self-host
probe to `src/codegen.ts:3292`, where `classMemberSignatures` used
`if (info.ctor)` to test an optional constructor record. The adjacent member
definition path had the same optional truthy check and the constructor helpers
read `info.ctor!` after their callers had already proved presence.

## Decision

Read `info.ctor` into locals, check with `!== undefined`, and thread the present
constructor record into `constructorSignature` and `emitConstructorDefinition`.
The helpers consume the present record directly instead of reading
`info.ctor!`. While touching `constructorSignature`, render the empty parameter
list with an explicit `params.length > 0 ? params : "void"` ternary instead of
string truthiness.

Rejected alternative: allowing truthy optional checks or redundant non-null
assertions would broaden the language subset and repeat earlier cleanup work.

## Implementation

- `src/codegen.ts:3292` checks a local constructor with `!== undefined`.
- `src/codegen.ts:3304` does the same for class member definitions.
- `src/codegen.ts:3311` makes `constructorSignature` consume a present
  constructor record.
- `src/codegen.ts:3319` uses an explicit parameter-list ternary instead of
  `params || "void"`.
- `src/codegen.ts:3327` makes `emitConstructorDefinition` consume the same
  present constructor record.

## Consequences

- **Accepted**: class constructor signature and definition emission use explicit
  optional checks at the call sites.
- **Rejected**: no truthy optional narrowing or redundant non-null assertion
  support is added.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe.
