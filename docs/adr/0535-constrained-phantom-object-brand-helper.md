# 0535 - constrained phantom object brand helper

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.68

## Context

ADR [0534](./0534-phantom-object-brand-helper-alias.md) accepted
one-parameter phantom-object helpers such as
`type Phantom<K> = { readonly __brand: K }` when they appear as the phantom
side of a primitive brand intersection. The existing two-parameter
`Brand<T, K>` helper lane already accepts narrow payload constraints from ADR
[0524](./0524-constrained-brand-template-payload.md), ADR
[0529](./0529-propertykey-brand-template-payload.md), and ADR
[0533](./0533-propertykey-union-brand-template-payload.md). TypeScript code
often writes the same constraint on the one-parameter phantom helper, so the
remaining gap is descriptor compatibility.

## Decision

Allow one-parameter phantom-object brand helpers to carry the same payload
constraint spellings as the `Brand<T, K>` payload parameter: no constraint,
`K extends string`, `K extends PropertyKey`, or an exact order-insensitive
`K extends string | number | symbol`. Treat the constraint only as
registration-time descriptor metadata; payload arguments still use the existing
string literal, `typeof Identifier`, `unknown`, or `never` spelling set.

Rejected alternatives: general generic constraint checking would widen beyond
erased brand descriptors; accepting `K extends number`, `K extends symbol`, or
partial unions would not match `PropertyKey`; treating `PropertyKey`, `symbol`,
or `number` as ordinary type annotations would reopen runtime semantics; adding
payload defaults belongs to a separate phase.

## Implementation

- `src/codegen.ts:4451` keeps phantom-object helper registration shape-based
  and reuses the shared brand payload constraint predicate for the optional
  payload constraint.
- `src/codegen.ts:4459` rejects unsupported phantom-helper payload
  constraints with the same accepted spelling list as generic brand helpers.
- `src/codegen.ts:4458` leaves defaulted one-parameter object aliases
  unregistered, preserving the existing generic default diagnostic.
- `examples/brand_phantom_object_template_constrained.ts` covers
  `K extends string` with same-brand aliasing and brand-to-base widening.
- `examples/brand_phantom_object_computed_template_property_key_constraint.ts`
  covers a computed phantom key with `K extends PropertyKey`.
- `examples/brand_phantom_object_template_property_key_union_constraint.ts`
  covers an order-insensitive `number | symbol | string` constraint.
- `examples/brand_phantom_object_bad_constraint_fail.ts` and
  `examples/brand_phantom_object_property_key_union_missing_fail.ts` pin the
  focused reject cases.
- `tests/smoke.sh:3455` adds the positive and focused fail regressions.
- `MEMO.md:461` records the phase 5.68 completion line.

## Consequences

- **Accepted**: constrained one-parameter phantom helpers only inside
  primitive brand intersections, including computed keys and the exact
  `PropertyKey` union spelling in any order.
- **Rejected**: `K extends number`, `K extends symbol`, partial unions,
  `keyof` constraints, payload defaults, bare `Phantom<Payload>`, and ordinary
  generic alias expansion.
- **Preserved**: no runtime `symbol` / `PropertyKey` semantics, no widened
  payload argument spellings, and no base-parameter or arbitrary one-parameter
  alias constraints.
- **Regression**:
  `brand_phantom_object_template_constrained`,
  `brand_phantom_object_computed_template_property_key_constraint`,
  `brand_phantom_object_template_property_key_union_constraint`,
  `brand_phantom_object_bad_constraint_fail`, and
  `brand_phantom_object_property_key_union_missing_fail`.
- **Regression count**: smoke now covers 563 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
