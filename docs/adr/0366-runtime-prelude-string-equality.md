# 0366 - runtime prelude string equality

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.39

## Context

ADR [0355](./0355-runtime-ts-prelude-boundary.md) fixed the tiny C substrate plus
internal Topaz runtime prelude split. ADR
[0360](./0360-substrate-backed-prelude-string-allocation.md) separated
allocation primitives from pure allocation clients, and ADR
[0365](./0365-runtime-prelude-boolean-stringification.md) proved scalar literal
clients can use stable internal prelude symbols.

`topaz_string_eq(...)` is pure byte equality, but it is also used as a C
substrate equality function for Map/Set hash table macros. Ordinary compiler
string equality does not need that substrate boundary, while container key
equality still does.

## Decision

Add internal prelude helper `__topaz_string_eq(a: string, b: string): boolean`
and retarget non-container compiler-owned string equality to its stable
`runtime_prelude` C symbol. The helper checks `.length` first and then compares
bytes through `charCodeAt(...)`; it intentionally avoids string `===` so it
does not lower recursively into itself.

Rejected alternatives: retargeting Map/Set string key equality was rejected
because hash table macro equality remains a C substrate boundary; migrating
string concat, `slice`, `repeat`, `String.fromCharCode`, or path normalization
was rejected because those are allocation or host/substrate questions; removing
or shrinking `runtime/runtime.h` was rejected as cleanup outside this phase;
changing loose equality policy was rejected because `==` / `!=` remain
unsupported.

## Implementation

- `runtime/prelude.ts:9` adds `__topaz_string_eq(...)` using only `.length` and
  `charCodeAt(...)`.
- `src/runtime_prelude.ts:6` embeds the regenerated prelude source for normal
  and release builds.
- `src/codegen.ts:2086` centralizes string equality calls through
  `emitRuntimePreludeStringEq(...)`.
- `src/codegen.ts:7825` lowers string `switch` case comparisons to the prelude
  helper.
- `src/codegen.ts:8374` lowers string `===` / `!==` to the prelude helper.
- `src/codegen.ts:9710` lowers `Array<string>.includes(...)` element comparison
  to the prelude helper.
- `tests/smoke.sh:231` checks emitted C for binary/string-switch call sites,
  `tests/smoke.sh:250` checks `Array<string>.includes(...)`, and
  `tests/smoke.sh:516` keeps the hidden-name diagnostic.

## Consequences

- **Accepted**: generated C for ordinary string equality can depend on the
  stable internal runtime prelude helper.
- **Accepted**: observable output for `string_basic`, `array_method_includes`,
  `map_set_basic`, and `set_constructor_iterable` remains unchanged.
- **Rejected**: user code still cannot resolve `__topaz_string_eq`.
- **Rejected**: Map/Set string key equality and `topaz_string_eq(...)` in the C
  substrate remain available for now.
- **Regression**: `runtime_prelude_string_eq`,
  `runtime_prelude_string_includes`, `runtime_substrate_string_map_set`, and
  `runtime_prelude_string_eq_hidden_fail` lock the migration boundary alongside
  the full smoke suite.
- **Scope outside**: no string allocation primitive migration, no container
  macro rewrite, no runtime header shrinkage, and no loose equality changes.
