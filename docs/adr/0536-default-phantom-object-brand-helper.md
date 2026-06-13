# 0536 - default phantom object brand helper

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.69

## Context

ADR [0534](./0534-phantom-object-brand-helper-alias.md) accepted
one-parameter phantom-object helpers, and ADR
[0535](./0535-constrained-phantom-object-brand-helper.md) aligned their payload
constraints with the two-parameter `Brand<T, K>` lane. ADR
[0526](./0526-default-brand-template-payload.md) had already accepted default
payload parameters for narrow two-parameter brand helpers. Real TypeScript
opaque helpers also write `type Phantom<K = "UserId"> = { readonly __brand: K }`
and then use `string & Phantom`, so the remaining gap is a descriptor-only
default, not generic alias default substitution.

## Decision

Store a validated payload default on one-parameter phantom-object helper
descriptors and consume it only when the helper is the phantom side of a
primitive brand intersection. A bare `Phantom` outside an intersection remains
unsupported, while `Base & Phantom<Payload>` keeps explicit payload arguments
authoritative over the stored default.

Rejected alternatives: full generic default substitution would reopen ordinary
generic alias monomorphization; registering defaulted one-parameter aliases
before shape validation would steal existing generic-default diagnostics from
arbitrary aliases; accepting arbitrary defaults such as `string` would widen
nominal payload identity; supporting nonprimitive brand bases remains outside
the erased primitive-brand lane.

## Implementation

- `src/codegen.ts:4451` registers defaulted phantom-object helpers only after
  the existing one-field readonly helper shape check succeeds.
- `src/codegen.ts:4465` validates the optional helper default with the existing
  brand payload spelling set: string literal, `typeof Identifier`, `unknown`,
  or `never`.
- `src/codegen.ts:4593` lets defaulted helpers in brand intersections accept
  zero or one payload argument, with explicit payloads overriding defaults.
- `examples/brand_phantom_object_template_default_payload.ts` covers same-brand
  assignment, brand-to-base widening, explicit nondefault separation, and
  `unknown` / `never` defaults.
- `examples/brand_phantom_object_computed_template_default_payload.ts` covers a
  computed unique-symbol phantom key with a type-query default payload.
- `examples/brand_phantom_object_bad_default_fail.ts` and
  `examples/brand_phantom_object_default_cross_assign_fail.ts` pin focused
  unsupported-default and nominal-separation diagnostics.

## Consequences

- **Accepted**: `Base & Phantom` when `Phantom<K = Payload>` is a recognized
  phantom-object helper and `Base` is `string`, `number`, `boolean`, or
  `bigint`.
- **Rejected**: arbitrary payload defaults, bare `Phantom`, extra helper type
  arguments, nonprimitive base brands, and ordinary generic defaults.
- **Preserved**: erased runtime representation, helper-name / field / payload
  nominal brand identity, explicit payload override behavior, and the existing
  payload spelling set.
- **Regression**: `brand_phantom_object_template_default_payload`,
  `brand_phantom_object_computed_template_default_payload`,
  `brand_phantom_object_bad_default_fail`, and
  `brand_phantom_object_default_cross_assign_fail`.
- **Regression count**: smoke now covers 570 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
