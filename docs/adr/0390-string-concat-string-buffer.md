# 0390 - string concat string-buffer migration

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.63

## Context

ADR [0389](./0389-string-buffer-intrinsic-substrate.md) added the internal
`StringBuffer` pseudo type and five hidden runtime-prelude-only intrinsics.
`docs/runtime-ts-migration.md` now orders string-buffer work as allocation
clients before raw byte reads and old boundary cleanup. `__topaz_string_concat`
is the smallest remaining allocation client because it only copies two
existing immutable strings.

## Decision

Migrate only `runtime/prelude.ts` `__topaz_string_concat(a, b)` to allocate a
`StringBuffer` with capacity `a.length + b.length`, append `a`, append `b`,
and materialize through `__topaz_string_buffer_to_string(buffer)`. Preserve
public string concat lowering and diagnostics. Rejected alternatives: migrating
concat, repeat, slice, fileURLToPath, and charCodeAt together was rejected
because this phase should be one reversible allocation-client step; replacing
concat call-site lowering with direct C helper calls was rejected because
concat already routes through stable runtime prelude; removing or reclassifying
`topaz_string_from_byte_codes(...)` was rejected because repeat, slice, and
fileURLToPath still use it; replacing `charCodeAt` / `topaz_string_byte_at(...)`
was rejected because raw byte reads are planned after materialization clients.

## Implementation

- `runtime/prelude.ts:38` changes only `__topaz_string_concat(a, b)` from the
  temporary `Array<number>` bridge to the string-buffer append path.
- `src/runtime_prelude.ts` is regenerated from `runtime/prelude.ts`.
- `tests/smoke.sh:376` keeps the stable prelude symbol and stale C helper
  checks, then extracts the generated concat function body to require
  `topaz_string_buffer_` and reject `topaz_string_from_byte_codes(...)` inside
  that body.
- `docs/runtime-ts-migration.md` and `MEMO.md` record concat as the second
  string-buffer allocation client after `String.fromCharCode`.

## Consequences

- **Accepted**: binary string `+`, string `+=`, and template-literal concat
  chains keep the same observable behavior while generated C now exercises
  `topaz_string_buffer_append_string(...)`.
- **Reject**: user source still cannot reference hidden prelude helpers.
- **Regression**: `runtime_prelude_string_concat` checks scoped generated-C
  helper usage and preserves the existing template literal output check.
- **Scope outside**: repeat, slice, fileURLToPath, charCodeAt, public stdlib
  surface, old byte-code substrate cleanup, manifest, doctor, check, explain,
  and release workflow files are unchanged.
