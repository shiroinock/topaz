# 0380 - runtime prelude String.fromCharCode migration

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.53

## Context

ADR [0377](./0377-runtime-prelude-panic-byte-string-boundary.md) introduced
internal prelude affordances for panic and byte-code string materialization,
and ADR [0378](./0378-runtime-prelude-file-url-path.md) proved that prelude TS
can delegate final byte allocation to `__topaz_string_from_byte_codes(...)`.
`String.fromCharCode(n)` still targeted a dedicated C helper even though its
public diagnostics are codegen-owned and its remaining policy is a small
Topaz-subset scalar check plus truncation.

## Decision

Move the public `String.fromCharCode(n)` lowering target to internal
`__topaz_string_from_char_code(n)` in `runtime/prelude.ts`, using the stable
`runtime_prelude` C symbol. Keep the public call-site-only surface and
diagnostics unchanged: `String` is not a real namespace binding, exactly one
argument is required, the argument must type as `number`, and the return type is
`string`. Preserve the ASCII policy by rejecting NaN, negative, and `>= 128`
values with the existing abort message, and preserve truncation toward zero for
valid fractional inputs before delegating final allocation to
`__topaz_string_from_byte_codes(Array<number>)`.

Rejected alternatives: keeping the stale dedicated C helper was rejected because
the scalar policy no longer needs C; migrating `topaz_string_from_byte_codes`
was rejected because byte-buffer materialization is still the explicit C
substrate boundary; broadening the phase to `slice`, `repeat`, concat,
`parseFloat`, number formatting, BigInt, containers, or host wrappers was
rejected to keep the migration isolated.

## Implementation

- `runtime/prelude.ts` adds `__topaz_string_from_char_code(n)`, checking the
  ASCII range, truncating valid numbers with `n - (n % 1)`, and passing a
  one-element `Array<number>` to `__topaz_string_from_byte_codes(...)`.
- `src/codegen.ts` keeps `emitStringStaticCall(...)` and
  `inferStringStaticReturn(...)` diagnostics unchanged, but emits
  `requireInternalPreludeFunctionCName("__topaz_string_from_char_code", ...)`.
- `runtime/runtime.h` removes `topaz_string_from_char_code(...)`; the
  byte-code allocation substrate remains.
- `scripts/check-runtime-substrate.mjs` drops the removed helper from the C
  substrate inventory; `src/runtime_header.ts` and `src/runtime_prelude.ts` are
  regenerated from the runtime sources.

## Consequences

- **Accepted**: public `String.fromCharCode(n): string` behavior and
  diagnostics remain stable while scalar policy leaves the C header.
- **Accepted**: generated C now contains the stable internal prelude symbol and
  no stale `topaz_string_from_char_code(...)` call or definition.
- **Regression**: `string_from_char_code`,
  `runtime_prelude_string_from_char_code`, existing arity/type failures, and
  `runtime_prelude_string_from_char_code_hidden_fail` lock the migration
  boundary.
- **Scope outside**: string byte-code allocation, `slice`, `repeat`, concat,
  `parseFloat`, number formatting, BigInt, containers, and host wrappers remain
  unchanged.
