# 0085. discriminated union explicit checks (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0084](./0084-record-anon-class-optional-set-copy.md) moved the full graph
self-host probe to `src/codegen.ts:1367`, where `tryMakeDiscriminatedUnion`
used `if (!cls)` on a `ClassInfo | undefined` lookup result. The same function
also had a truthy field check, Set spread for a diagnostic, and
`classNames.sort()`.

## Decision

Use explicit undefined checks for class and field lookups, build the duplicate
literal diagnostic string with `for-of`, and maintain `classNames` in sorted
order with the existing `typeKeyLess` insertion-sort pattern.

Rejected alternatives: adding truthy/falsy checks, Set spread, or array sort
support here would broaden language/runtime behavior for one compiler-internal
canonicalization path.

## Implementation

- `src/codegen.ts:1366` rewrites class lookup to a positive branch.
- `src/codegen.ts:1371` rewrites field lookup to explicit undefined and kind
  checks.
- `src/codegen.ts:1376` replaces Set spread/join diagnostic construction.
- `src/codegen.ts:1385` maintains `classNames` with insertion sort.

## Consequences

- **Accepted**: discriminated union detection and canonical variant ordering are
  unchanged.
- **Rejected**: no truthy/falsy, Set spread, or array sort support is added.
- **Regression**: no new example was added because existing discriminated-union
  tests cover behavior, and the full graph self-host probe covers this
  compiler-source cleanup.
