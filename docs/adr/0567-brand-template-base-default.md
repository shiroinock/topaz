# 0567 - Brand template base default

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.100

## Context

ADR [0526](./0526-default-brand-template-payload.md) accepted payload defaults
only inside recognized erased brand-template helpers and rejected base defaults
to avoid general generic default substitution. ADR
[0564](./0564-brand-template-base-constraints.md) later moved the brand base
constraint into descriptor metadata. With both pieces in place, a recognized
`Brand<T, K>` helper can store an explicit base default as brand metadata while
keeping ordinary generic aliases, functions, and classes outside the feature.

## Decision

Recognized base/payload brand-template aliases now store an optional base
default descriptor. The default is accepted only when it resolves to the same
erased base family as explicit brand bases: `string`, `number`, `boolean`, or
`bigint`; it must also satisfy the stored base-constraint descriptor from ADR
0564. Reference arity follows TypeScript ordering: without a base default the
old arities remain, with a base default and a payload default `Brand`,
`Brand<Base>`, and `Brand<Base, Payload>` are accepted, and a single type
argument is always the base argument.

Rejected alternatives: ordinary generic default substitution would affect
non-brand aliases, functions, and classes; assignment-context base inference
would make omitted type arguments depend on use sites instead of explicit alias
metadata; payload-only shorthand such as `Brand<"UserId">` would conflict with
TypeScript type-argument ordering; widening the base family or adding runtime
`symbol`/public `PropertyKey` values belongs to a separate surface.

## Implementation

- `src/codegen.ts:1473` adds `baseDefault` to the base/payload brand-template
  descriptor.
- `src/codegen.ts:4560` resolves and validates a base default while registering
  a recognized brand-template alias.
- `src/codegen.ts:4672` shares base validation between explicit base arguments
  and stored base defaults, preserving the existing unsupported-base and
  constraint diagnostics.
- `src/codegen.ts:4737` applies the new arity matrix and uses the stored base
  only when the alias reference omits an explicit base.
- `tests/smoke.sh:3536` adds normal and computed-key positive regressions;
  `tests/smoke.sh:3555` pins unsupported base-default and constraint-violating
  base-default rejects.
- `MEMO.md:493` records the phase 5.100 completion line.

## Consequences

- **Accepted**: `Brand` with both defaults, `Brand<number>` where the explicit
  base wins over `T = string`, `Brand<string, "TeamId">` where the explicit
  payload wins, constrained `T extends string = string`, and computed-key
  helpers using `K = typeof UserIdBrand`.
- **Rejected**: base defaults outside the erased base family, base defaults
  that violate `T extends string`/`PropertyKey`/`string | number | symbol`,
  ordinary generic defaults outside recognized brand templates, arbitrary
  payload defaults, and payload-only shorthand.
- **Preserved**: erased C representation as `{ kind: "brand", base, key }`,
  explicit base arguments remaining authoritative, payload-default behavior,
  and lack of runtime `symbol` or public `PropertyKey` values.
- **Regression**: `brand_generic_template_base_default`,
  `brand_generic_computed_template_base_default`,
  `brand_generic_template_base_default_fail`,
  `brand_generic_template_base_default_constraint_fail`,
  `type_param_default_generic_fail`, and existing payload/base constraint
  brand-template failures.
- **Regression count**: smoke now covers 636 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
