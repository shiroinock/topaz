# 0526 - default brand template payload

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.59

## Context

ADR [0523](./0523-generic-brand-template-alias.md) accepted narrow generic
brand helpers, ADR [0524](./0524-constrained-brand-template-payload.md)
allowed `K extends string`, and ADR
[0525](./0525-type-query-brand-payload.md) allowed `typeof Identifier` payload
spellings. Common TypeScript opaque helpers also default the phantom payload
parameter, for example `type Brand<T, K = "UserId"> = T & { readonly __brand:
K }`, then instantiate `Brand<string>`. Topaz can accept that type-only
compatibility spelling without implementing general generic type-parameter
defaults.

## Decision

Preserve type-parameter defaults in the shared AST and both parser frontends,
but interpret them only while registering a recognized brand-template alias.
The base type parameter must still have no constraint and no default. The
payload type parameter may remain unconstrained or `extends string`, and its
default, if present, must use the existing brand payload spelling helper:
string literal type or `typeof Identifier`. A template with no payload default
continues to require exactly two type arguments; a template with a payload
default accepts one or two, and an explicit second argument wins.

Rejected alternatives: implementing full generic defaults would require alias,
function, and class substitution semantics outside this compatibility slice;
allowing a default for the base parameter would imply partial base inference
that Topaz does not have; accepting arbitrary payload defaults such as `string`
or object types would create non-nominal payload identities; keeping defaults
as parser errors would reject a common helper spelling that can remain fully
type-only.

## Implementation

- `src/ast.ts:583` adds `defaultType` to the shared `TypeParam` shape.
- `src/convert_from_tsc.ts:539` converts `tp.default` instead of rejecting it
  in the TypeScript frontend.
- `src/topaz_parser.ts:437` parses `= <type>` after an optional type-parameter
  constraint.
- `src/codegen.ts:1437` stores an optional payload default spelling on
  `BrandAliasTemplateInfo`.
- `src/codegen.ts:2553`, `src/codegen.ts:2645`, and `src/codegen.ts:2721`
  keep type-parameter defaults unsupported for generic classes, ordinary
  generic aliases, and generic functions outside the brand-template exception.
- `src/codegen.ts:4410` rejects base parameter defaults, while
  `src/codegen.ts:4423` validates payload defaults with the existing brand
  payload spelling helper.
- `src/codegen.ts:4469` resolves `Brand<Base>` through the stored default and
  leaves `Brand<Base, Payload>` explicit payloads authoritative.
- `tests/smoke.sh:3445` adds the default-payload positives and focused reject
  regressions.
- `MEMO.md:452` records the phase 5.59 completion line.

## Consequences

- **Accepted**: `type Brand<T, K = "UserId"> = T & { readonly __brand: K }`
  with `Brand<string>`, plus computed-key helpers using
  `K = typeof UserIdBrand`.
- **Rejected**: cross-assigning different default or explicit payload brands,
  arbitrary payload defaults such as `K = string`, base parameter defaults, and
  ordinary generic defaults outside the brand-template exception.
- **Preserved**: constrained payload parameters, explicit two-argument brand
  references, type-query payloads, base-erased C representation, and brand key
  identity based on helper name, phantom field key, and stable payload spelling.
- **Deferred**: general generic default substitution, namespace or symbol value
  lookup, public runtime `unique symbol`, and non-brand computed type-literal
  support.
- **Regression**: `brand_generic_template_default_payload`,
  `brand_generic_computed_template_default_payload`,
  `brand_generic_template_default_cross_assign_fail`,
  `brand_generic_template_bad_default_fail`,
  `brand_generic_template_base_default_fail`, and
  `type_param_default_generic_fail` pin the new surface.
- **Regression count**: smoke now covers 529 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
