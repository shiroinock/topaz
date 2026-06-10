# 0392 - string slice string-buffer migration

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.65

## Context

ADR [0391](./0391-string-repeat-string-buffer.md) moved repeat to the
string-buffer append path. `docs/runtime-ts-migration.md` leaves slice and
fileURLToPath as the remaining byte-code materialization clients before raw
byte reads and old boundary cleanup. Slice is the next allocation client
because it already computes byte indexes in the runtime prelude and only needs
to materialize the selected byte range.

## Decision

Migrate only `runtime/prelude.ts` `__topaz_string_slice(s, rawStart, rawEnd)` to
allocate a `StringBuffer` with capacity `hi - lo`, push each source byte from
`lo` to `hi`, and materialize through
`__topaz_string_buffer_to_string(buffer)`. Preserve public
`String.prototype.slice(start?, end?)` lowering, diagnostics, NaN sentinel call
shape, negative index normalization, clamping, fractional truncation, and
`hi < lo` behavior. Rejected alternatives: migrating fileURLToPath,
charCodeAt, or old byte-code substrate cleanup together was rejected because
this phase should be one reversible allocation-client step; adding a substring
C helper was rejected because the existing `StringBuffer` intrinsic family is
the compiler-owned allocation path; removing or reclassifying
`topaz_string_from_byte_codes(...)` was rejected because fileURLToPath still
uses it.

## Implementation

- `runtime/prelude.ts:100` changes only `__topaz_string_slice(s, rawStart,
  rawEnd)` from the temporary `Array<number>` bridge to the string-buffer
  byte-push path.
- `src/runtime_prelude.ts` is regenerated from `runtime/prelude.ts`.
- `tests/smoke.sh:329` keeps the stable prelude symbol and stale C helper
  checks, then extracts the generated slice function body to require
  `topaz_string_buffer_` and reject `topaz_string_from_byte_codes(...)` inside
  that body.
- `docs/runtime-ts-migration.md` and `MEMO.md` record slice as the next
  string-buffer allocation client after repeat.

## Consequences

- **Accepted**: existing `examples/string_method.ts` slice outputs, omitted
  argument sentinels, negative indexes, clamps, fractional indexes, and
  empty-range results keep the same observable behavior while generated C now
  exercises `topaz_string_buffer_push_byte(...)` for byte ranges.
- **Reject**: user source still cannot reference hidden prelude helpers.
- **Regression**: `runtime_prelude_string_slice` checks scoped generated-C
  helper usage and preserves the existing `examples/string_method.ts` output.
- **Scope outside**: fileURLToPath, charCodeAt, public stdlib surface, old
  byte-code substrate cleanup, manifest, doctor, check, explain, and release
  workflow files are unchanged.
