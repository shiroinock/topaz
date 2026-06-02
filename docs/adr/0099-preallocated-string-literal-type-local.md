# 0099. preallocated string literal type local (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0098](./0098-recursive-anon-root-body-local-narrowing.md) moved the full graph
self-host probe to `src/codegen.ts:1744`, where `fillPreAllocatedAnonFields`
accessed `m.type.value` after checking `m.type.kind === "type_str_lit"`. The
current self-host flow did not narrow the repeated property read.

## Decision

Store `m.type` in a local and read `.value` inside the positive
`memberType.kind === "type_str_lit"` branch.

Rejected alternative: broadening property-read narrowing is compiler
flow-analysis work and unnecessary for this local cleanup.

## Implementation

- `src/codegen.ts:1743` adds `memberType`.
- `src/codegen.ts:1744` checks `memberType.kind`.
- `src/codegen.ts:1745` reads `memberType.value`.

## Consequences

- **Accepted**: preallocated string-literal discriminator field population is
  unchanged.
- **Rejected**: no property-read narrowing change is added.
- **Regression**: no new example was added because existing recursive alias and
  discriminated-union tests cover behavior, and the full graph self-host probe
  covers this compiler-source cleanup.
