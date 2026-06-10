# 0361 - runtime prelude trimStart

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.34

## Context

ADR [0355](./0355-runtime-ts-prelude-boundary.md) fixed the tiny-substrate plus
internal-prelude split, ADR [0358](./0358-runtime-prelude-starts-with.md) and
[0359](./0359-runtime-prelude-ends-with.md) migrated the first boolean string
helpers, and ADR
[0360](./0360-substrate-backed-prelude-string-allocation.md) accepted a
separate boundary for allocation clients that can delegate final string copying
to existing substrate primitives. `String.prototype.trimStart()` is the first
concrete candidate for that boundary: its observable work is a leading ASCII
whitespace scan, while the final allocation can stay on `s.slice(start)`.

The phase brief fixes scope to `trimStart` only. `startsWith` / `endsWith`
stay on their existing prelude helpers, and allocation primitives such as
`slice`, `repeat`, concat, and `String.fromCharCode` remain on the C substrate.

## Decision

Add internal prelude helpers `__topaz_string_is_trim_start_code(code)` and
`__topaz_string_trim_start(s)` to `runtime/prelude.ts`, regenerate the embedded
`src/runtime_prelude.ts`, and lower only `String.prototype.trimStart()` to the
stable internal prelude symbol. Keep the zero-argument diagnostic unchanged,
keep `runtime/prelude.ts` internal-only, and keep `runtime/runtime.h` intact.

Rejected alternatives: migrating additional allocation helpers in the same
change was rejected because the brief fixes scope to `trimStart`; exposing
`runtime/prelude.ts` as a public import or helper API was rejected because the
prelude remains compiler-owned; removing or splitting `runtime/runtime.h` was
rejected because the final string allocation still uses the existing substrate
primitive.

## Implementation

- `runtime/prelude.ts:24` adds the ASCII whitespace predicate plus
  `__topaz_string_trim_start(...)`, and `src/runtime_prelude.ts:4` embeds the
  regenerated source for normal and release builds.
- `src/codegen.ts:9796` keeps the existing `String.trimStart` arity diagnostic,
  but now resolves the stable internal prelude symbol
  `__topaz_string_trim_start` instead of calling `topaz_string_trim_start`
  directly.
- `tests/smoke.sh:231` adds emitted-C coverage for
  `topaz_fn_runtime_prelude___topaz_string_trim_start`, and
  `tests/smoke.sh:393` adds a hidden-name failure proving user code still
  cannot resolve `__topaz_string_trim_start`.
- `docs/runtime-ts-migration.md:52` and `MEMO.md:275` record `trimStart` as the
  first allocation-returning helper migrated onto the substrate-backed prelude
  lane.

## Consequences

- **Accepted**: generated C for `String.prototype.trimStart()` now calls a
  stable internal Topaz prelude helper rather than the old direct C helper.
- **Accepted**: the helper returns `string`, but its final allocation still
  flows through the existing `slice` substrate primitive.
- **Accepted**: user-visible behavior and the `String.trimStart expects no
  arguments` diagnostic remain unchanged.
- **Rejected**: user code still cannot resolve `__topaz_string_trim_start` by
  name, and allocation primitives remain on the C substrate path.
- **Regression**: `string_trim_start`, `runtime_prelude_trim_start`,
  `string_trim_start_arity_fail`, and
  `runtime_prelude_trim_start_hidden_fail` lock the behavior alongside the
  existing full smoke suite and release checks.
- **Scope outside**: no migration of `slice`, `repeat`, concat,
  `String.fromCharCode`, path helpers, BigInt, containers, filesystem, or
  process helpers; no public prelude API; no manifest/doctor/capability work;
  no release/tag publication.
