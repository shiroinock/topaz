# 0365 - runtime prelude boolean stringification

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.38

## Context

ADR [0355](./0355-runtime-ts-prelude-boundary.md) fixed the tiny C substrate plus
internal Topaz runtime prelude split, and ADR
[0360](./0360-substrate-backed-prelude-string-allocation.md) separated
allocation primitives from pure allocation clients. ADRs
[0358](./0358-runtime-prelude-starts-with.md) through
[0364](./0364-runtime-prelude-path-basename.md) migrated pure string and path
clients into the runtime prelude while keeping public API and diagnostics
unchanged.

`topaz_boolean_to_string(...)` is a pure scalar-to-literal conversion used by
compiler-owned stringification paths. Template literal substitutions and
`Array<boolean>.join(...)` need a `topaz_string` value, but direct console
boolean IO prints to a stream and does not need this helper path.

## Decision

Add internal prelude helper `__topaz_boolean_to_string(value: boolean): string`
and retarget non-IO compiler-owned boolean stringification to its stable
`runtime_prelude` C symbol. The helper returns the string literals `"true"` and
`"false"`, preserving the existing observable output while proving another
runtime client can live in Topaz-subset TS.

Rejected alternatives: adding public `boolean.toString()` was rejected because
that is a user-visible language feature with separate diagnostics and
regressions; changing `console.log(boolean)` / `console.error(boolean)` /
`console.warn(boolean)` was rejected because those are IO helpers; migrating
number, bigint, array join buffering, string concat, or string allocation
primitives was rejected because their formatting, limb, buffer, or allocation
boundaries are separate; removing `topaz_boolean_to_string(...)` from
`runtime/runtime.h` was rejected as substrate cleanup outside this phase.

## Implementation

- `runtime/prelude.ts:4` adds `__topaz_boolean_to_string(...)` as a pure
  boolean branch returning the existing string literals.
- `src/runtime_prelude.ts:6` embeds the regenerated prelude source for normal
  and release builds.
- `src/codegen.ts:2825` lowers `Array<boolean>.join(...)` element
  stringification through the stable internal prelude symbol.
- `src/codegen.ts:8952` lowers boolean template literal substitutions through
  the same prelude symbol while leaving number and bigint stringification on
  their existing helpers.
- `tests/smoke.sh:215` checks emitted C for
  `topaz_fn_runtime_prelude___topaz_boolean_to_string` and verifies
  `examples/template_literal.ts` still prints the same output.
- `docs/runtime-ts-migration.md:84` and `MEMO.md:279` record boolean
  stringification as the next internal runtime prelude migration.

## Consequences

- **Accepted**: generated C for boolean template substitutions and
  `Array<boolean>.join(...)` can depend on the stable internal runtime prelude
  helper.
- **Accepted**: observable template literal and boolean array join behavior
  remains unchanged.
- **Rejected**: user code still cannot resolve `__topaz_boolean_to_string`, and
  public boolean methods are not added.
- **Rejected**: direct boolean console IO and the C helper in
  `runtime/runtime.h` remain available for now.
- **Regression**: `runtime_prelude_boolean_to_string`,
  `runtime_prelude_boolean_to_string_hidden_fail`, `template_literal`, and
  `array_method_join` lock the behavior alongside the full smoke suite.
- **Scope outside**: no public `boolean.toString()`, no number or bigint
  migration, no array join buffer rewrite, no string allocation primitive
  migration, and no runtime header shrinkage.
