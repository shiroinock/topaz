# 0383 - runtime prelude string concat

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.56

## Context

Compiler-owned string concatenation was still lowered directly to the C helper
`topaz_string_concat(...)`. That helper is a pure allocation client over two
already materialized Topaz strings, and the runtime prelude now has byte reads
through `charCodeAt` plus hidden materialization through
`__topaz_string_from_byte_codes(...)`. This makes concat small enough to move
without adding new public language surface or string-buffer intrinsics.

## Decision

Add internal prelude helper `__topaz_string_concat(a, b)` and lower binary
string `+`, string `+=`, and template literal concat chains to its stable
`runtime_prelude` C symbol. The helper copies bytes from `a` and `b` into an
`Array<number>` and delegates final allocation to
`__topaz_string_from_byte_codes(...)`.

Rejected alternatives: using string `+` inside the prelude helper was rejected
because it would recurse through the same lowering; migrating `String.repeat`
was rejected because repeat still owns range, finiteness, and output-size
checks; replacing `__topaz_string_from_byte_codes(...)` was rejected because
byte-string materialization remains the intended C substrate affordance.

## Implementation

- `runtime/prelude.ts:30` adds `__topaz_string_concat(...)` beside the other
  string prelude helpers.
- `src/codegen.ts:2096`, `src/codegen.ts:8341`, `src/codegen.ts:8377`, and
  `src/codegen.ts:8956` share the stable runtime-prelude concat lowering across
  string `+=`, binary string `+`, and template literal concat chains.
- `runtime/runtime.h:353` now moves directly from optional wrappers to string
  equality, with the stale `topaz_string_concat(...)` C helper removed.
- `scripts/check-runtime-substrate.mjs:212` now starts at the string equality
  entry, with the stale concat substrate inventory entry removed.
- `src/runtime_header.ts` and `src/runtime_prelude.ts` are regenerated from the
  runtime sources.
- `tests/smoke.sh:296` and `tests/smoke.sh:911` check generated C for the
  stable prelude symbol, absence of the stale C helper call/definition,
  unchanged `template_literal` output, and hidden-helper rejection.

## Consequences

- **Accepted**: binary string `+`, string `+=`, and template literal behavior
  remain byte-for-byte unchanged for ASCII Topaz strings.
- **Accepted**: the `needs-string-buffer-intrinsics` lane shrinks by one symbol;
  `topaz_string_from_byte_codes(...)` remains the allocation substrate.
- **Regression**: `runtime_prelude_string_concat` locks the generated-C route and
  behavior, and `runtime_prelude_string_concat_hidden_fail` keeps the helper
  hidden from user source.
- **Scope outside**: no `String.repeat`, `charCodeAt`,
  `__topaz_string_from_byte_codes`, container, or string-buffer-intrinsic
  migration.
