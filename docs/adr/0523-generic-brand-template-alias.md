# 0523 - generic brand template alias

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.56

## Context

ADR [0521](./0521-nominal-erased-string-phantom-brand.md) accepted
non-generic phantom brand aliases, and ADR
[0522](./0522-computed-unique-symbol-phantom-brand.md) added computed
identifier phantom keys. Real TypeScript code often factors the same spelling
through `type Brand<T, K> = T & { readonly __brand: K }`, but generic type
aliases remain too broad for the current alias recursion and substitution
model. This slice accepts only that helper-shaped alias as type-only syntax.

## Decision

Register a narrow brand-template alias separately from ordinary `typeAliases`
when the generic alias has exactly two unconstrained type parameters and a body
of `T & { readonly field: K }` or `T & { readonly [Field]: K }`. Resolve
`Brand<Base, "Payload">` at type-reference sites by lowering `Base` through the
existing type machine, requiring an erasable primitive brand base, requiring a
string literal payload argument, and returning the existing `brand(base, key)`
type. The nominal key uses the helper name, phantom field spelling, and payload
literal, so aliases sharing the same helper/payload describe the same brand.

Rejected alternatives: full generic alias monomorphization would need recursive
substitution, object-literal alias cycles, and a broader instantiation table;
keying by the outer alias name would make `type UserId = Brand<string,
"UserId">` less TypeScript-like and require extra alias context threading;
non-literal payloads would add value/type expression dependencies; constrained
helpers such as `K extends string` remain outside the current `TypeParam`
representation.

## Implementation

- `src/codegen.ts:1435` adds `BrandAliasTemplateInfo`, and
  `src/codegen.ts:1698` keeps template aliases in a dedicated registry.
- `src/codegen.ts:2633` recognizes helper-shaped generic aliases during alias
  registration, while unrecognized generic aliases still use the existing
  unsupported diagnostic.
- `src/codegen.ts:4358` inspects the un-substituted alias body for exactly one
  base type-parameter reference and one readonly required phantom field.
- `src/codegen.ts:4402` resolves `Brand<Base, "Payload">`, checks arity, base
  kind, and literal payload, then builds the template-based brand key.
- `src/codegen.ts:4524` looks up brand templates before ordinary alias
  resolution, preserving type-parameter shadowing and non-generic alias
  memoization.
- `tests/smoke.sh:3436` adds two positive samples and four focused rejection
  samples.
- `MEMO.md:449` records the phase 5.56 completion line.

## Consequences

- **Accepted**: generic `Brand<T, K>` helpers with identifier or computed
  identifier phantom fields, explicit `expr as BrandAlias`, same-brand calls /
  returns, brand-to-base widening, base equality, `Array<brand>`, and primitive
  bases including `number`.
- **Rejected**: cross-brand assignment, implicit base-to-brand assignment,
  non-literal payload type arguments, wrong helper shapes, and ordinary generic
  aliases such as `type Pair<T> = Array<T>`.
- **Deferred**: generic alias monomorphization, constrained/defaulted type
  parameters, runtime `symbol`, `typeof` payloads, non-primitive brand bases,
  and arbitrary computed property expressions.
- **Regression**: `brand_generic_template` and
  `brand_generic_computed_template` cover the accepted lowering; the four
  `brand_generic_template_*_fail` samples pin rejected forms.
- **Regression count**: smoke now covers 515 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
