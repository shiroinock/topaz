# 0388 - string buffer intrinsic family

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.61

## Context

Phase 3.60 pinned the remaining `needs-string-buffer-intrinsics` lane to exactly
`topaz_string_byte_at(...)` and `topaz_string_from_byte_codes(...)`. Ordinary
Topaz-subset TS migration is now blocked on string allocation and raw byte
access because concat, repeat, slice, `String.fromCharCode`, `fileURLToPath`,
and `charCodeAt` need a compiler-owned boundary rather than public byte buffers.

## Decision

Adopt an internal-prelude-only `StringBuffer` pseudo type and five hidden
intrinsic helpers as the implementation target:
`__topaz_string_buffer_new(capacity: number): StringBuffer`,
`__topaz_string_buffer_push_byte(buffer: StringBuffer, byte: number): void`,
`__topaz_string_buffer_append_string(buffer: StringBuffer, value: string): void`,
`__topaz_string_buffer_byte_at(buffer: StringBuffer, index: number): number`,
and `__topaz_string_buffer_to_string(buffer: StringBuffer): string`.
`StringBuffer` is opaque compiler state, not a user-visible class, interface,
import, structural type, `Array<number>`, or pointer escape. Only the internal
runtime prelude may mention these helpers.

Rejected alternatives: public `StringBuffer` API was rejected because the buffer
is a representation device; `Array<number>` as final carrier was rejected
because it is only the temporary bridge; unsafe pointer / FFI support was
rejected because it broadens the substrate; immediate removal of
`topaz_string_byte_at(...)` or `topaz_string_from_byte_codes(...)` was rejected
because this phase changes no lowering or C substrate.

## Implementation

- `docs/runtime-ts-migration.md:68` records the hidden intrinsic family, opaque
  pseudo type, staged lowering requirement, replacement order, and pre-v0.2.0
  release boundary.
- `MEMO.md:302` records the Phase 3.61 docs checkpoint, and `MEMO.md:309`
  reserves `v0.1.3` for string-buffer intrinsic implementation and
  prelude-client migration groundwork without public language surface expansion.
- No runtime, prelude, codegen, substrate checker, smoke, example, or release
  workflow file changes in this phase.

## Consequences

- **Accepted**: future phases can implement `StringBuffer` type/lowering and
  migrate prelude allocation clients in small slices.
- **Rejected**: user modules still cannot call `__topaz_*` string-buffer
  helpers or observe `StringBuffer` as a public type.
- **Regression**: existing build, smoke, runtime-substrate, and release gates
  remain the validation path; this docs-only phase adds no examples.
- **Scope outside**: no runtime behavior changes, no public diagnostics changes,
  no removal or reclassification of the current two-symbol C boundary, and no
  manifest / doctor / check / explain work.
