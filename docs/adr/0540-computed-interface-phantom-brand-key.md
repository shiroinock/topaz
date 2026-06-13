# 0540 - computed interface phantom brand key

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.73

## Context

ADR [0539](./0539-interface-phantom-brand-descriptor.md) accepted
non-generic single-readonly-field interfaces as erased phantom brand
descriptors, but deferred computed interface keys because the interface AST did
not preserve the computed-name spelling. Real `unique symbol`-style opaque
patterns commonly use `readonly [BrandKey]: "Payload"`, and the existing
type-literal/helper brand lanes already treat `[Name]` as type-only metadata.
This step should align interface descriptors with those lanes without making
ordinary interface ABI support computed fields.

## Decision

Preserve interface field name metadata as `identifier`, `computed_identifier`,
or `computed_unsupported`, matching type-literal fields. A non-generic
single-readonly-field interface descriptor may use either an identifier key or
a computed identifier key; computed identifiers are stored as `[Name]` in the
nominal key. Computed descriptor fields are erased from ordinary interface
vtable collection because there is no runtime symbol field ABI.

Rejected alternatives: supporting generic `interface Phantom<K>` still belongs
to generic interface staging; accepting arbitrary computed interface fields
would require a real ABI and field-access story; evaluating runtime `symbol` or
`unique symbol` values is outside the erased brand model; accepting arbitrary
computed expressions such as `["brand"]` would create unstable source spelling
and remains a focused diagnostic.

## Implementation

- `src/ast.ts:640` adds `nameKind` to interface field members.
- `src/topaz_parser.ts:679` reuses the computed-aware field-name parser for
  interface fields while keeping computed interface methods unsupported.
- `src/convert_from_tsc.ts:532` preserves computed identifier versus
  unsupported computed property signatures from the TypeScript AST.
- `src/codegen.ts:3577` registers descriptor overlays before member
  collection, rejects non-descriptor computed interface fields, and skips the
  computed descriptor key from runtime vtable emission.
- `src/codegen.ts:3624` stores computed descriptor keys as `[Name]` and emits
  a focused diagnostic for unsupported computed phantom expressions.
- `examples/brand_interface_computed_phantom.ts` covers string-literal,
  `typeof Identifier`, `unknown`, and `never` payload spellings with computed
  interface keys.
- `examples/brand_interface_computed_phantom_bad_key_fail.ts` and
  `examples/interface_computed_field_fail.ts` pin unsupported computed
  expression keys and ordinary computed interface fields.
- `MEMO.md:466` records the phase boundary.

## Consequences

- **Accepted**: `Base & InterfaceBrand` when the interface descriptor has one
  readonly computed identifier field and an established payload spelling.
- **Rejected**: ordinary computed interface fields, unsupported computed
  expressions, mutable/method/multi-field descriptors, generic interfaces, and
  runtime symbol semantics.
- **Preserved**: identifier-key interface phantom descriptors and computed
  type-literal/helper brand keys continue to use the same nominal key policy.
- **Regression**: `brand_interface_computed_phantom`,
  `brand_interface_computed_phantom_bad_key_fail`, and
  `interface_computed_field_fail`.
- **Regression count**: smoke now covers 577 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
