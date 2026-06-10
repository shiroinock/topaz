# 0391 - string repeat string-buffer migration

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.64

## Context

ADR [0390](./0390-string-concat-string-buffer.md) moved compiler-owned string
concat to the string-buffer append path. `docs/runtime-ts-migration.md` orders
the remaining string byte materialization clients as repeat, slice, and
fileURLToPath before raw byte reads and old boundary cleanup. Repeat is the
next allocation client because it only appends the same immutable source string
repeatedly after existing validation.

## Decision

Migrate only `runtime/prelude.ts` `__topaz_string_repeat(s, count)` to allocate
a `StringBuffer` with capacity `s.length * n`, append `s` once per repeat
iteration, and materialize through `__topaz_string_buffer_to_string(buffer)`.
Preserve public `String.prototype.repeat(count)` lowering, diagnostics, range
checks, fractional truncation, empty-output behavior, and output-size panic
text. Rejected alternatives: migrating slice, fileURLToPath, charCodeAt, or old
byte-code substrate cleanup together was rejected because this phase should be
one reversible allocation-client step; replacing public repeat lowering with
direct C helper calls was rejected because the stable runtime prelude symbol is
the public boundary; removing or reclassifying `topaz_string_from_byte_codes(...)`
was rejected because slice and fileURLToPath still use it.

## Implementation

- `runtime/prelude.ts:45` changes only `__topaz_string_repeat(s, count)` from
  the temporary `Array<number>` bridge to the string-buffer append path.
- `src/runtime_prelude.ts` is regenerated from `runtime/prelude.ts`.
- `tests/smoke.sh:421` keeps the stable prelude symbol, stale C helper, and
  max-macro checks, then extracts the generated repeat function body to require
  `topaz_string_buffer_` and reject `topaz_string_from_byte_codes(...)` inside
  that body.
- `docs/runtime-ts-migration.md` and `MEMO.md` record repeat as the next
  string-buffer allocation client after concat.

## Consequences

- **Accepted**: `"x".repeat(3)`, empty repeat results, positive fractional
  counts, and composed string expressions keep the same observable behavior
  while generated C now exercises `topaz_string_buffer_append_string(...)` for
  repeated appends.
- **Reject**: user source still cannot reference hidden prelude helpers.
- **Regression**: `runtime_prelude_string_repeat` checks scoped generated-C
  helper usage and preserves the existing `examples/string_repeat.ts` output.
- **Scope outside**: slice, fileURLToPath, charCodeAt, public stdlib surface,
  old byte-code substrate cleanup, manifest, doctor, check, explain, and
  release workflow files are unchanged.
