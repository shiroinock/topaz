# 0048. Iterator source string storage (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-02
- **Phase**: 1.5-6i prep

## Context

[0047](./0047-codegen-error-formatted-split.md) moved the full graph
self-host probe past the formatted diagnostic constructor union and exposed the
next blocker:
`cTypeName: union topaz_union_string_literal_map_keys_or_string_literal_map_values_or_string_literal_set_values is not \`T | undefined\``.

The source was iterator-internal metadata: `IterNextInfo.source` and related
helper parameters used the string-literal union
`"map_values" | "map_keys" | "set_values"`. Topaz currently lowers
`T | undefined` and discriminated unions, but not arbitrary non-optional
string-literal unions.

## Decision

Widen the iterator metadata tags to plain `string`. `source` is only used to
build a per-source/per-container monomorph key and choose the generated
`_values_next` versus `_keys_next` suffix. The parallel `field` selector is
also widened to `string` because it is passed through the same internal helper
chain and emitted directly as the hash slot field name.

Rejected alternatives: adding arbitrary string-literal union lowering now is a
broader language representation decision; numeric tags would avoid strings but
add conversion branches and make generated helper naming less direct; splitting
the metadata into separate map-values, map-keys, and set-values classes would
add structural churn without improving the generated C.

## Implementation

- `src/codegen.ts:921` changes `IterNextInfo.source` and `field` to `string`.
- `src/codegen.ts:1209` changes `recordIterMonomorph` parameters to `string`.
- `src/codegen.ts:2481` changes the `emitIterNextFunction` entry shape to
  `string` tags.
- `src/codegen.ts:2513` changes `emitIterConstruction` parameters to `string`.

## Consequences

- **Accepted**: `.values()` / `.keys()` call sites still pass the same fixed
  literals and generated C helper names stay unchanged.
- **Accepted**: compiler-internal iterator metadata no longer requires a
  general string-literal union representation.
- **Rejected**: this does not add arbitrary string-literal union lowering.
- **Regression**: no new example was added because Iterator behavior is
  unchanged; existing Map / Set iterator smoke cases cover the observable
  surface.
- **Future direction**: if string-literal unions become user-facing subset
  requirements, they should get a principled representation instead of
  accumulating internal special cases.
