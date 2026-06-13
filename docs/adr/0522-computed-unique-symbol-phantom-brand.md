# 0522 - computed unique-symbol phantom brand

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.55

## Context

ADR [0521](./0521-nominal-erased-string-phantom-brand.md) accepted
non-generic phantom brand aliases with identifier fields, but the common
TypeScript form using an ambient `unique symbol` key still failed before the
brand alias recognizer could erase it. The goal here is compatibility with that
type-only spelling, without adding runtime `symbol` values or a public
`unique symbol` type implementation.

## Decision

Represent type-literal field names as identifier, computed identifier, or
unsupported computed names. Accept `[Identifier]` only when it is the single
readonly required phantom field of a non-generic brand alias intersection, and
include the computed marker in the nominal key spelling. The computed
identifier is not resolved as a Topaz value or type binding; it is carried only
as source spelling for the brand key. Keep the C representation base-erased and
keep `expr as BrandAlias` as the only brand assertion surface.

Rejected alternatives: implementing `unique symbol` as a real value type would
pull runtime symbol semantics into a type-only slice; requiring the computed
identifier to resolve would force ambient declarations into the runtime
compiler; merging `UserIdBrand` and `[UserIdBrand]` keys would lose the
source-level distinction; arbitrary `[expr]` names remain too broad because
they require expression typing inside type-literal member names.

## Implementation

- `src/ast.ts:65` adds explicit type-literal field name kinds.
- `src/convert_from_tsc.ts:1520` maps tsc computed property names to computed
  identifiers only when the expression is an identifier.
- `src/topaz_parser.ts:181` and `src/topaz_parser.ts:2059` parse `[Ident]`
  type-literal field names and keep non-identifier computed names as an
  unsupported computed marker.
- `src/codegen.ts:4318` rejects unsupported computed phantom names with a
  focused diagnostic, while `src/codegen.ts:4337` folds `[Name]` into the
  brand key.
- `src/codegen.ts:4615` keeps computed fields in ordinary structural type
  literals unsupported outside phantom brand aliases.
- `tests/smoke.sh:3430` adds the positive computed-key brand sample plus four
  focused rejection samples.

## Consequences

- **Accepted**: `type UserId = string & { readonly [UserIdBrand]: "UserId" }`,
  `const id: UserId = "u1" as UserId`, same-brand calls / returns,
  brand-to-base widening, base equality, and `Array<UserId>`.
- **Rejected**: implicit base-to-brand assignment, cross computed-key brand
  assignment, non-identifier computed phantom names, and computed fields in
  ordinary structural type literals.
- **Deferred**: generic `Brand<T, K>`, runtime `symbol`, public `unique symbol`
  types, `typeof Brand`, and arbitrary computed property expressions.
- **Regression**: `brand_unique_symbol_phantom` covers the accepted lowering;
  the four `brand_unique_symbol_*_fail` samples pin the rejected forms.
- **Regression count**: smoke now covers 509 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.

