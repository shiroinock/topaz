# 0528 - unknown / never brand payload spellings

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.61

## Context

ADR [0521](./0521-nominal-erased-string-phantom-brand.md) through ADR
[0527](./0527-ambient-unique-symbol-brand-marker.md) built the erased brand
track around stable syntactic payload spellings. Common opaque helpers also use
`unknown` or `never` as a defaulted phantom payload, for example
`type Opaque<T, Token = unknown> = T & { readonly __opaque: Token }` and
`type Tagged<T, Tag = never> = T & { readonly __tag: Tag }`. Those payloads are
type-only and can extend the existing spelling helper without adding runtime
representation or general generic default semantics.

## Decision

Extend the brand payload spelling helper to accept exactly string literal
types, `typeof Identifier`, `unknown`, and `never`. The same helper remains the
single gate for non-generic phantom brand aliases, explicit brand-template
payload arguments, and payload defaults on recognized brand-template aliases.
`unknown` and `never` are preserved as distinct payload key spellings, so
`Opaque<string>` and `Opaque<string, unknown>` match when the default is
`unknown`, while `Opaque<string, never>` remains a separate nominal brand.

Rejected alternatives: routing payload nodes through `typeFromAnnotation` would
make erased brand identity depend on broader type resolution; accepting
primitive keyword payloads such as `string` or `number` would weaken the
nominal boundary ADR 0526 kept rejected; treating `unknown` or `never` as
runtime-bearing fields would contradict the erased brand model; adding
assignability exceptions for `never` payload brands would make brand
compatibility structural rather than key-based.

## Implementation

- `src/codegen.ts:4369` reports the expanded payload spelling set for
  non-generic phantom field payload rejects.
- `src/codegen.ts:4432` applies the same spelling set to recognized
  brand-template payload defaults.
- `src/codegen.ts:4447` maps `type_unknown` to the stable `unknown` payload key
  and the exact zero-argument `never` type reference to the stable `never`
  payload key.
- `src/codegen.ts:4496` applies the expanded diagnostic to explicit
  brand-template payload arguments.
- `tests/smoke.sh:3447` adds direct `unknown` / `never` payload positives,
  defaulted `unknown` / `never` template positives, and focused reject
  regressions for cross-payload assignment and arbitrary payload references.
- `MEMO.md:454` records the phase 5.61 completion line.

## Consequences

- **Accepted**: direct erased brand payloads spelled `unknown` or `never`,
  `Opaque<Base>` defaulting to `unknown`, and `Tagged<Base>` defaulting to
  `never`.
- **Rejected**: `unknown` to `never` brand assignment, arbitrary payload type
  references, primitive keyword payloads such as `string`, object/type literal
  payloads, arrays, generic references, qualified names, and unions.
- **Preserved**: ordinary `unknown` behavior such as catch bindings, `never`
  return annotations, type-query payload spellings, default string-literal
  payloads, computed brand keys, and base-erased C representation.
- **Deferred**: arbitrary generic defaults, payload type identity beyond stable
  spelling, runtime `symbol` values, and structural brand assignability.
- **Regression**: `brand_unknown_never_payload`,
  `brand_generic_template_unknown_default_payload`,
  `brand_generic_template_never_default_payload`,
  `brand_generic_template_unknown_never_cross_assign_fail`, and
  `brand_generic_template_arbitrary_payload_ref_fail` pin this surface.
- **Regression count**: smoke now covers 547 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
