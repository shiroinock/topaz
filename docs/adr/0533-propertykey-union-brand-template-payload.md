# 0533 - PropertyKey union brand template payload constraints

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.66

## Context

ADR [0529](./0529-propertykey-brand-template-payload.md) accepted
`K extends PropertyKey` only as registration-time metadata for recognized
erased brand-template aliases. Some TypeScript brand helpers spell the same
bound inline as `K extends string | number | symbol`. Topaz can accept that
spelling for the brand-template payload lane without adding general
`PropertyKey`, `symbol`, number/symbol payload identity, or generic constraint
checking.

## Decision

Accept `string | number | symbol` as an exact, order-insensitive union
constraint only on the second payload parameter of a recognized brand-template
alias. Preserve the existing unconstrained, `K extends string`, and
`K extends PropertyKey` registrations. Payload arguments and defaults continue
to use the existing stable spelling set: string literal, `typeof Identifier`,
`unknown`, or `never`.

Rejected alternatives: adding `symbol`, `number`, or `PropertyKey` to
`typeFromAnnotation` would make ordinary annotations appear supported; treating
the union as permission for number or symbol payload arguments would broaden
nominal key identity beyond stable spellings; accepting partial unions such as
`string | number` would no longer model the TypeScript `PropertyKey` expansion;
general constraint solving would widen this narrow compatibility slice.

## Implementation

- `src/codegen.ts:4423` reports the focused payload-constraint diagnostic as
  `brand template payload constraint must be string, PropertyKey, or string | number | symbol`.
- `src/codegen.ts:4441` keeps the zero-argument `string` / `PropertyKey`
  `type_ref` fast path and adds an exact three-member `type_union` spelling
  check for `string`, `number`, and `symbol`.
- `src/convert_from_tsc.ts:1474` maps the tsc `symbol` keyword into the same
  spelling-only `type_ref` node that `topaz_parser` already produces, without
  adding type lowering support.
- `examples/brand_generic_template_property_key_union_constraint.ts` covers the
  ordinary `K extends string | number | symbol` helper.
- `examples/brand_generic_computed_template_property_key_union_constraint.ts`
  covers a computed unique-symbol key helper with the same members in a
  different order.
- `examples/brand_generic_template_property_key_union_missing_fail.ts` pins the
  missing-member payload constraint rejection.
- `examples/brand_generic_template_base_property_key_union_constraint_fail.ts`
  pins the preserved base-parameter union constraint rejection.
- `tests/smoke.sh:3449` adds the positive and focused fail regressions.
- `MEMO.md:458` records the phase 5.66 completion line.

## Consequences

- **Accepted**: recognized erased brand-template aliases whose payload
  parameter is unconstrained, constrained to `string`, constrained to
  `PropertyKey`, or constrained to the exact union `string | number | symbol`.
- **Rejected**: base parameter constraints, non-brand generic constraints,
  partial or extended payload unions, aliases such as `keyof T`, and payload
  arguments/defaults outside the existing spelling set.
- **Preserved**: no general `symbol`, `number`, or `PropertyKey` support in
  type annotations, no runtime `symbol` support, and no generic constraint
  checker.
- **Regression**:
  `brand_generic_template_property_key_union_constraint`,
  `brand_generic_computed_template_property_key_union_constraint`,
  `brand_generic_template_property_key_union_missing_fail`, and
  `brand_generic_template_base_property_key_union_constraint_fail`.
- **Regression count**: smoke now covers 553 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
