# 0529 - PropertyKey brand template payload constraints

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.62

## Context

ADR [0524](./0524-constrained-brand-template-payload.md) accepted the narrow
brand-template spelling `K extends string`, and ADR
[0528](./0528-unknown-never-brand-payload.md) kept payload identity tied to a
small syntactic spelling set. Real TypeScript brand helpers also commonly spell
the phantom payload parameter as `K extends PropertyKey`, while still passing
string-literal or type-query payloads at use sites. Topaz can accept that helper
declaration as type-only metadata without adding a general `PropertyKey` type,
runtime `symbol`, or generic constraint solver.

## Decision

Accept `PropertyKey` only as an exact zero-argument `type_ref` constraint on
the second payload parameter of a recognized brand-template alias. Preserve the
existing `K extends string` path and keep base parameter constraints rejected
before template registration succeeds. Payload arguments and defaults continue
to use the existing spelling helper: string literal, `typeof Identifier`,
`unknown`, or `never`.

Rejected alternatives: adding `PropertyKey` to `typeFromAnnotation` would make
ordinary annotations appear supported; treating `PropertyKey` as permission for
`number` or `symbol` payload arguments would broaden nominal key identity beyond
stable spellings; accepting `T extends PropertyKey` would add base-parameter
constraint semantics; routing arbitrary constraints such as `keyof T` or
`string | number` through the brand exception would require real generic
constraint checking.

## Implementation

- `src/codegen.ts:4420` now checks payload constraints through
  `isBrandPayloadTypeParamConstraint`, accepting exactly `string` or
  `PropertyKey` on recognized brand templates.
- `src/codegen.ts:4423` reports the focused diagnostic
  `brand template payload constraint must be string or PropertyKey` for other
  payload constraints.
- `examples/brand_generic_template_property_key_constraint.ts` covers the
  ordinary `K extends PropertyKey` helper.
- `examples/brand_generic_computed_template_property_key_constraint.ts` covers
  the computed unique-symbol key helper with the same payload constraint.
- `examples/brand_generic_template_base_property_key_constraint_fail.ts` pins
  the preserved rejection for `T extends PropertyKey`.
- `tests/smoke.sh:3444` adds the positive and focused fail regressions.
- `MEMO.md:455` records the phase 5.62 completion line.

## Consequences

- **Accepted**: recognized erased brand-template aliases whose payload
  parameter is unconstrained, constrained to `string`, or constrained to
  `PropertyKey`.
- **Rejected**: base parameter constraints such as `T extends PropertyKey`,
  non-brand generic constraints, arbitrary payload constraints, and payload
  arguments/defaults outside the existing spelling set.
- **Preserved**: no general `PropertyKey` support in type annotations, no
  runtime `symbol` value support, no generic alias monomorphization, and no
  broader payload identity.
- **Regression**:
  `brand_generic_template_property_key_constraint`,
  `brand_generic_computed_template_property_key_constraint`, and
  `brand_generic_template_base_property_key_constraint_fail` pin this surface.
- **Regression count**: smoke now covers 544 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
