# 0534 - phantom object brand helper alias

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.67

## Context

ADR [0521](./0521-nominal-erased-string-phantom-brand.md) accepted inline
phantom-object brand aliases, and ADR
[0523](./0523-generic-brand-template-alias.md) accepted two-parameter
`Brand<T, K>` helpers. Real TypeScript code also commonly factors only the
phantom object as `type Phantom<K> = { readonly __brand: K }`, then writes the
branded primitive as `string & Phantom<"UserId">`. That spelling is still
type-only and base-erased, so the remaining gap is descriptor recognition, not
runtime object support.

## Decision

Register one-parameter aliases whose body is exactly one readonly required
phantom object field as erased phantom-object brand helpers. Resolve those
helpers only when the helper reference is the phantom side of a two-part brand
intersection whose other side resolves to `string`, `number`, `boolean`, or
`bigint`. The nominal key uses the helper alias name, phantom field spelling,
and payload spelling, matching the existing `Brand<T, K>` policy.

Rejected alternatives: full generic alias monomorphization would require
recursive substitution and object alias expansion; resolving bare
`Phantom<"UserId">` as an ordinary object would imply generic type-literal
instantiation; keying by the outer alias name would diverge from generic brand
helpers; accepting mutable, optional, multi-field, method, or unsupported
computed helpers would widen beyond erased brand descriptors; adding number or
symbol literal payload identity would reopen the payload spelling boundary.

## Implementation

- `src/codegen.ts:1436` records whether a brand template is a two-argument
  base/payload helper or a one-argument phantom-object helper.
- `src/codegen.ts:4319` recognizes phantom-object helper references as the
  phantom side of a brand intersection before resolving the primitive base.
- `src/codegen.ts:4451` registers `type Phantom<K> = { readonly field: K }`
  and computed-key variants through the existing phantom field-shape checker.
- `src/codegen.ts:4518` keeps bare phantom-object helper references
  unsupported outside brand intersections.
- `src/codegen.ts:4561` resolves `Phantom<Payload>` with the existing stable
  payload spelling set and keys it as `Phantom:field:payload`.
- `examples/brand_phantom_object_template.ts` covers ordinary helper brands
  including same-brand aliasing plus `unknown` / `never` payloads.
- `examples/brand_phantom_object_computed_template.ts` covers ambient
  unique-symbol computed keys and `typeof Identifier` payloads.
- `examples/brand_phantom_object_cross_assign_fail.ts`,
  `examples/brand_phantom_object_bare_fail.ts`, and
  `examples/brand_phantom_object_bad_shape_fail.ts` pin cross-brand, bare
  helper, and bad helper-shape rejection.
- `tests/smoke.sh:3451` adds the positive and focused fail regressions.
- `MEMO.md:460` records the phase 5.67 completion line.

## Consequences

- **Accepted**: primitive erased brands written as `Base & Phantom<Payload>`
  with identifier or computed identifier phantom keys and payloads spelled as
  string literal, `typeof Identifier`, `unknown`, or `never`.
- **Rejected**: bare `Phantom<Payload>`, wrong arity, wrong helper shape,
  optional or mutable phantom fields, unsupported computed fields, nonprimitive
  bases, and payload spellings outside the existing brand set.
- **Preserved**: no runtime `symbol` / `unique symbol`, no generic alias
  monomorphization, no ordinary object instantiation for phantom helpers, and
  no widened structural type expansion.
- **Regression**:
  `brand_phantom_object_template`,
  `brand_phantom_object_computed_template`,
  `brand_phantom_object_cross_assign_fail`,
  `brand_phantom_object_bare_fail`, and
  `brand_phantom_object_bad_shape_fail`.
- **Regression count**: smoke now covers 558 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
