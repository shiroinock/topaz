# 0159. classImplements explicit lookup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0158](./0158-verify-implements-param-indexed-reads.md) moved the full graph
self-host probe to `src/codegen.ts:3188`, where `classImplements` used
`if (!cls)` after `this.classes.get(className)`. The lookup result is
`ClassInfo | undefined`, and Topaz conditions must be strict `boolean`.

## Decision

Use `cls === undefined` for the absent branch and keep the `implements` read in
the present branch.

Rejected alternative: adding truthy/falsy optional narrowing would broaden the
language subset for a compiler-source cleanup.

## Implementation

- `src/codegen.ts:3188` checks absence with `cls === undefined`.
- `src/codegen.ts:3190` returns the `implements.includes` result from the
  present branch.

## Consequences

- **Accepted**: interface conformance helpers continue to use explicit optional
  lookup narrowing.
- **Rejected**: no truthy/falsy optional narrowing is added.
- **Regression**: no new example was added because this is covered by the full
  graph self-host probe.
