# 0645 — Materialized array element assignment targets

- **Status**: Accepted
- **Date**: 2026-07-19
- **Phase**: 5.178

## Context

[0644](./0644-shared-assignment-target-refs-property-receivers.md) made
`AssignmentTargetRef` the shared awaited-assignment target descriptor and
accepted await-free call receivers for class and interface fields. Array
element targets still rejected effectful receiver and index expressions even
though their receiver, index, and compound old-value lowering already flowed
through descriptor-owned frame temps.

## Decision

Extend only the `array_element` descriptor with receiver and index
materialization metadata. Each target side remains restricted to an existing
safe expression or an await-free call expression. The async frame captures the
receiver first, the index second, and the compound old value third before the
first RHS await; the final assignment reads only those captured values.

Rejected alternatives: receiver-only or index-only special cases would split
one target's ordering contract across phases; loosening synchronous assignment
validation would broaden unrelated semantics; and general expression
decomposition would require an expression IR beyond this phase.

## Implementation

- `src/codegen.ts:223-232` records whether either array target side was
  materialized from an await-free call.
- `src/codegen.ts:6129-6175` routes effectful array compound statements through
  the shared descriptor-backed materialization path.
- `src/codegen.ts:6337-6390` accepts only safe or call-shaped await-free array
  receiver/index expressions and preserves receiver-before-index capture.
- `src/codegen.ts:8604-8628` snapshots compound old values through captured
  array target temps for multi-await assignment expressions.
- `src/codegen.ts:10059-10077` emits descriptor-backed array reads from frame
  receiver/index temps without replaying target side effects.

## Consequences

- **Accepted**: direct/simple RHS await assignments and existing multi-await
  assignment expressions may use an await-free call receiver, index, or both.
- **Ordering**: receiver and index calls run once in source order; compound old
  values precede RHS awaits; the final write and expression result use the
  captured target.
- **Rejected**: optional targets, target-side await, `new`, arbitrary target
  expressions, non-array receivers, non-number indices, and
  short-circuit/conditional RHS lowering remain closed.
- **Regression**: receiver-only, index-only, combined, multi-await simple and
  compound positives plus target-await, optional, arbitrary-index, and
  short-circuit failures bring smoke coverage to 726 cases.
- **Scope**: synchronous assignment, runtime, scheduler, PromiseLike, thenable,
  and general expression-IR work are unchanged.
