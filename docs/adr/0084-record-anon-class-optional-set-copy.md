# 0084. recordAnonClass optional Set copy (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0083](./0083-record-anon-class-field-type-positive-narrowing.md) moved the full
graph self-host probe to `src/codegen.ts:1271`, where `recordAnonClass` copied
optional field names with `new Set(optionalFields)`. The current subset rejects
constructor iterable arguments for `Set`.

## Decision

Allocate an empty `Set<string>`, copy `optionalFields` with `for-of`, and assign
that copy into the synthesized `ClassInfo`.

Rejected alternatives: adding iterable constructor support for `Set` is broader
runtime/library work; aliasing the input set would risk later mutation coupling.

## Implementation

- `src/codegen.ts:1263` creates `optionalFieldsCopy`.
- `src/codegen.ts:1264` copies each optional field with `.add`.
- `src/codegen.ts:1275` stores the copied set in `ClassInfo`.

## Consequences

- **Accepted**: anonymous class optional-field metadata remains an independent
  copy.
- **Rejected**: no `Set(iterable)` support is added.
- **Regression**: no new example was added because existing optional
  type-literal/object-literal tests cover behavior, and the full graph
  self-host probe covers this compiler-source cleanup.
