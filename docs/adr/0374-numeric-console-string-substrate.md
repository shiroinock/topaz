# 0374 - numeric console string substrate

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.47

## Context

ADR [0373](./0373-console-boolean-prelude-io.md) routed boolean console IO
through compiler-owned boolean stringification plus the existing string IO
substrate, removing dedicated C boolean console helpers. Number and BigInt
console helpers had the same wrapper shape: they called existing
`topaz_number_to_string(...)` / `topaz_bigint_to_string(...)` and then wrote the
result to stdout or stderr. After ADR
[0372](./0372-runtime-substrate-inventory-check.md), avoidable wrapper helpers
should not remain part of the inventory when composition preserves behavior.

## Decision

Route `console.log(number | bigint)`, `console.error(number | bigint)`, and
`console.warn(number | bigint)` through the existing numeric stringification
helpers and then into the existing string console IO helper for the same stream.
Remove the six dedicated C number/BigInt console helpers from the embedded
runtime header and substrate inventory.

Rejected alternatives: keeping number/BigInt console IO helpers in C was
rejected because they duplicate stringification plus string IO composition;
moving number/BigInt stringification to Topaz now was rejected because those
helpers still depend on substrate internals (`snprintf` / `strtod` search and
raw limb formatting); moving string IO to Topaz was rejected because
stdout/stderr writes are host IO substrate; changing formatting or newline
behavior was rejected because public console behavior must remain unchanged.

## Implementation

- `src/codegen.ts:9091` keeps console arity/type validation and lowers numeric
  console arguments to
  `topaz_console_<stream>_string(topaz_number_to_string(...))` or
  `topaz_console_<stream>_string(topaz_bigint_to_string(...))`.
- `runtime/runtime.h:284`, `runtime/runtime.h:415`, and `runtime/runtime.h:653`
  keep `topaz_bigint_to_string(...)`,
  `topaz_console_{log,error,warn}_string(...)`, and
  `topaz_number_to_string(...)`; `runtime/runtime.h:745` now proceeds directly
  to array macros after number formatting, with
  `topaz_console_{log,error,warn}_{number,bigint}` removed. `src/runtime_header.ts`
  is regenerated from that header.
- `scripts/check-runtime-substrate.mjs:184` keeps only the string console IO
  helpers classified as console substrate after removing the stale numeric
  console wrapper inventory entries.
- `tests/smoke.sh:292` adds `runtime_numeric_console_string`, which requires the
  stringification and string IO helpers in generated C, rejects old numeric
  console helper call sites or definitions, compiles the C, and verifies
  stdout/stderr output.

## Consequences

- **Accepted**: number and BigInt console output keeps the same stdout/stderr,
  newline, and formatting behavior.
- **Accepted**: `topaz_number_to_string(...)` and
  `topaz_bigint_to_string(...)` remain C substrate for now.
- **Accepted**: the substrate inventory shrinks and will fail if the removed
  numeric console helpers are reintroduced without classification.
- **Rejected**: console diagnostics, string/boolean console lowering,
  `Number.prototype.toString()`, and the BigInt public surface are unchanged.
- **Regression**: `runtime_numeric_console_string`, `number_format`,
  `number_to_string`, `bigint_arithmetic`, `bigint_value_skeleton`,
  `process_io`, and the console fail cases cover the public and generated-C
  paths alongside the full smoke suite.
- **Scope outside**: no migration of number/BigInt stringification to Topaz, no
  migration of string IO substrate, and no broader runtime helper cleanup.
