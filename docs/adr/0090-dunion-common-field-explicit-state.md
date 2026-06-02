# 0090. dunionCommonFieldType explicit state (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0089](./0089-dunion-literal-field-positive-branch.md) moved the full graph
self-host probe to `src/codegen.ts:1430`, where `dunionCommonFieldType`
declared `let result: TopazType | undefined` without an initializer. The current
subset requires initialized `let` declarations. The same helper used truthy
checks for class and field lookup results.

## Decision

Initialize `result` to `undefined`, use explicit lookup checks, and compare
against a narrowed `TopazType` local when a prior result exists.

Rejected alternatives: allowing uninitialized `let` or truthy/falsy checks would
contradict existing subset rules.

## Implementation

- `src/codegen.ts:1430` initializes `result`.
- `src/codegen.ts:1432` rewrites class lookup with `=== undefined`.
- `src/codegen.ts:1435` rewrites field lookup with `=== undefined`.
- `src/codegen.ts:1438` compares using a narrowed `current` local.

## Consequences

- **Accepted**: common dunion field detection is unchanged.
- **Rejected**: no uninitialized `let` or truthy/falsy support is added.
- **Regression**: no new example was added because existing dunion common-field
  tests cover behavior, and the full graph self-host probe covers this
  compiler-source cleanup.
