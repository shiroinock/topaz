# 0521 - nominal-erased string phantom brand

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.54

## Context

ADR [0467](./0467-post-v0-2-typescript-compatibility-priorities.md)
prioritized branded / opaque / nominal TypeScript compatibility after the
async track. The common `string & { readonly __brand: "UserId" }` pattern was
still rejected because Topaz had no intersection type AST and no controlled
`as` expression surface. Accepting the erasable pattern first gives existing
TS code a nominal-ish type-only escape without adding runtime wrapper objects.

## Decision

Accept non-generic type aliases whose body is exactly `base & phantomObject`,
where the base is `string`, `number`, `boolean`, or `bigint`, and the phantom
object has exactly one readonly required identifier field whose type is a
string literal. Lower these aliases to a `brand(base, key)` Topaz type whose
key includes the alias name, phantom field name, and payload, while `cTypeName`
and container element storage use the base C representation. Accept only
`expr as BrandAlias` as explicit brand entry, after checking that `expr` is
assignable to the brand base; keep arbitrary non-brand assertions rejected.

Rejected alternatives: transparently erasing intersections to the base type
would lose the nominal boundary; runtime wrapper structs would add allocation
and ABI surface; `unique symbol` / computed phantom fields need declaration
and type-literal support not in this slice; generic `Brand<T, K>` remains
outside the current non-generic alias model.

## Implementation

- `src/ast.ts:15` and `src/ast.ts:330` add intersection type and type-assertion
  AST nodes.
- `src/convert_from_tsc.ts:967` and `src/convert_from_tsc.ts:1449` convert
  `as` expressions and `IntersectionTypeNode`.
- `src/topaz_parser.ts:1375` and `src/topaz_parser.ts:1920` parse `expr as T`
  and give `&` higher type precedence than `|`.
- `src/codegen.ts:92`, `src/codegen.ts:812`, and `src/codegen.ts:938` add the
  nominal-erased `brand` type identity and base C representation.
- `src/codegen.ts:526`, `src/codegen.ts:3365`, and `src/codegen.ts:3506` allow
  `Array<brand>` under a nominal helper name with base element storage.
- `src/codegen.ts:4264` recognizes the accepted alias shape and emits focused
  unsupported-shape diagnostics.
- `src/codegen.ts:15405`, `src/codegen.ts:16412`, and `src/codegen.ts:16822`
  enforce brand assertion, assignability, and zero-cost brand-to-base coercion.

## Consequences

- **Accepted**: `type UserId = string & { readonly __brand: "UserId" }`,
  `const id: UserId = "u1" as UserId`, same-brand calls / returns,
  brand-to-base widening, same-brand/base string equality, and `Array<UserId>`.
- **Rejected**: implicit base-to-brand assignment, different-brand assignment,
  cross-brand assertion, non-brand `as`, empty / multi-field / optional /
  non-readonly / non-string-literal phantom objects, computed phantom fields,
  `unique symbol`, and generic brand aliases.
- **Runtime**: brand values have the same C representation as their base; no
  wrapper object, runtime tag, allocation, or dependency is introduced.
- **Regression**: `brand_string_phantom` covers positive lowering; the four
  `brand_string_phantom_*_fail` samples pin implicit assignment, cross-brand
  assignment, non-brand assertion, and bad shape rejection.
- **Regression count**: smoke now covers 501 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
