# 0525 - type-query brand payload

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.58

## Context

ADR [0522](./0522-computed-unique-symbol-phantom-brand.md) accepted computed
identifier phantom brand keys and ADR [0523](./0523-generic-brand-template-alias.md)
accepted narrow generic brand helpers, but both still required string-literal
payloads. Real TypeScript brand declarations commonly use the type-only spelling
`typeof UserIdBrand` as the phantom payload beside a `unique symbol` key. Topaz
needs that compatibility without adding runtime `symbol` values or declaration
space lookup.

## Decision

Add a dedicated `type_query` type AST node for `typeof Identifier` in type
position, and accept it only as a brand payload spelling. Non-generic brand
aliases and generic brand-template references now share a payload spelling
helper: string literal payloads keep their raw text, while type-query payloads
use `typeof <Identifier>` in the nominal brand key. Keep the helper body shape
unchanged as `T & { readonly phantom: K }`, so template registration still only
identifies the payload type parameter and template resolution interprets the
actual payload argument.

Rejected alternatives: implementing public `unique symbol` or `symbol` types
would require runtime value semantics outside this type-only slice; resolving
ambient `declare const` bindings would pull declaration lookup into nominal
erased brands; converting `typeof` to a string literal during parsing would lose
the type-query distinction needed by later compatibility work; accepting
qualified queries such as `typeof ns.Brand` would require an expression-name
representation plus namespace/import semantics.

## Implementation

- `src/ast.ts:15` adds `TypeQuery` to the shared `TypeNode` union and stores the
  bare identifier spelling.
- `src/convert_from_tsc.ts:1439` converts `ts.TypeQueryNode` only when
  `exprName` is an identifier, rejecting qualified queries with a focused
  diagnostic.
- `src/topaz_parser.ts:2005` parses `typeof Identifier` in type position and
  rejects qualified type queries before leaving trailing tokens.
- `src/codegen.ts:4351` uses the shared brand payload spelling helper for
  non-generic phantom brand aliases.
- `src/codegen.ts:4412` adds the helper that preserves string-literal payloads
  and formats type-query payloads as `typeof <Identifier>`.
- `src/codegen.ts:4453` applies the same helper to generic brand-template
  payload arguments, while `src/codegen.ts:4484` keeps arbitrary type-query
  annotations unsupported outside brand payloads.
- `tests/smoke.sh:3431` adds the non-generic positive and focused fail samples;
  `tests/smoke.sh:3444` adds the generic-template positive and cross-assign
  fail sample.
- `MEMO.md:451` records the phase 5.58 completion line.

## Consequences

- **Accepted**: `type UserId = string & { readonly [UserIdBrand]: typeof
  UserIdBrand }` and `type UserId = Brand<string, typeof UserIdBrand>` lower to
  base-erased nominal brands.
- **Rejected**: implicit base-to-brand assignment, cross-brand assignment when
  the `typeof` payload differs, and qualified type queries such as
  `typeof SomeNamespace.UserIdBrand`.
- **Preserved**: existing string-literal brand payloads, computed brand keys,
  constrained brand-template helpers, and the lack of runtime `symbol` /
  `unique symbol` values.
- **Deferred**: ambient binding resolution, public symbol types, arbitrary type
  queries, qualified type-query names, and structural computed type-literal
  fields outside brand aliases.
- **Regression**: `brand_type_query_payload`,
  `brand_generic_template_type_query_payload`,
  `brand_type_query_cross_assign_fail`, `brand_type_query_implicit_fail`,
  `brand_type_query_qualified_fail`, and
  `brand_generic_template_type_query_cross_assign_fail` pin the new surface.
- **Regression count**: smoke now covers 529 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
