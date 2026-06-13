# 0527 - ambient unique-symbol brand marker

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.60

## Context

ADR [0522](./0522-computed-unique-symbol-phantom-brand.md) accepted computed
brand key spellings, ADR [0525](./0525-type-query-brand-payload.md) accepted
`typeof Identifier` payload spellings, and ADR
[0526](./0526-default-brand-template-payload.md) accepted generic brand helpers
with default payloads. Those examples still depended on `.d.ts` references for
`unique symbol` markers, while many TypeScript projects colocate the marker
with the brand alias as `declare const UserIdBrand: unique symbol;`. Topaz can
accept that declaration as erased type-only compatibility syntax without
implementing runtime `symbol` values or declaration-space lookup.

## Decision

Add a narrow ambient const declaration node for exactly
`declare const <Identifier>: unique symbol;`, plus the optional
`export declare const` spelling. Both frontends preserve it as data, and
codegen drops it during declaration extraction. Computed brand fields and
`typeof Identifier` payloads remain spelling-based: the marker declaration does
not create a runtime variable, a type binding, or an export.

Rejected alternatives: implementing public `unique symbol` / `symbol` types
would require runtime value semantics outside the erased brand track; resolving
ambient markers before accepting brand keys would make the existing spelling
model depend on declaration lookup; accepting `declare global`, ambient
modules, or arbitrary `declare function` forms would broaden this compatibility
slice beyond in-file brand markers; treating `declare const` as a runtime const
would emit an uninitialized value that TypeScript never provides.

## Implementation

- `src/ast.ts:565` adds `AmbientConstDecl` to the shared `Decl` union, with
  `isExported`, `name`, and a `unique_symbol` marker payload at
  `src/ast.ts:679`.
- `src/lexer.ts:165` recognizes `declare` as a keyword for the Topaz parser.
- `src/topaz_parser.ts:248` routes top-level `declare` through
  `parseAmbientConstDecl`, and `src/topaz_parser.ts:404` accepts only the
  exact `declare const ...: unique symbol` shape with focused rejects.
- `src/convert_from_tsc.ts:205` treats ambient variable statements as
  declaration-like, while `src/convert_from_tsc.ts:292` converts only the exact
  TypeScript `unique symbol` type-operator form.
- `src/codegen.ts:2335` skips `ambient_const_decl` during declaration
  extraction, so no runtime storage or type binding is emitted.
- `MEMO.md:453` records the phase 5.60 compatibility line.

## Consequences

- **Accepted**: in-file `declare const UserIdBrand: unique symbol;`,
  `declare const TeamIdBrand: unique symbol;`, and
  `export declare const UserIdBrand: unique symbol;` before erased brand aliases.
- **Rejected**: `declare let` / `declare var`, missing annotations,
  initializers, multiple declarators, non-`unique symbol` annotations, and
  arbitrary ambient declarations such as `declare function`.
- **Preserved**: `[UserIdBrand]` contributes the key spelling
  `[UserIdBrand]`, `typeof UserIdBrand` contributes payload spelling
  `typeof UserIdBrand`, and `.d.ts` reference-based brand samples continue to
  work.
- **Deferred**: runtime `symbol` / `unique symbol` values, declaration-space
  lookup, ambient modules, `declare global`, and public export semantics for
  type-only markers.
- **Regression**: `brand_ambient_unique_symbol_marker`,
  `brand_generic_ambient_unique_symbol_marker`,
  `brand_export_ambient_unique_symbol_marker`,
  `brand_ambient_unique_symbol_initializer_fail`,
  `brand_ambient_unique_symbol_wrong_type_fail`,
  `brand_ambient_unique_symbol_non_const_fail`, and
  `brand_ambient_declare_function_fail` pin this surface.
- **Regression count**: smoke now covers 536 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
