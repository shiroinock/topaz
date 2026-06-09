# 0348 - number.toString zero-argument support

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.20

## Context

After [0347](./0347-cleanup-target-frame-walk-narrowing.md), the self-host
gate advanced to `src/codegen.ts:9612:24`. `Array.push` spread lowering used
`fixedTmps.length.toString()` to turn an array length into a generated C
reserve fragment, but Topaz only stringified numbers through template literals,
console logging, array join, and the existing `topaz_number_to_string` runtime
helper.

## Decision

Add zero-argument `number.toString()` as a primitive scalar method lowered to
`topaz_number_to_string(receiver)`. Return inference treats it as `string`, and
the receiver is emitted through the normal expression path so it is evaluated
once at the call site. Rejected alternatives: rewriting the compiler source to
avoid `.toString()` was rejected because this is ordinary TypeScript; supporting
`number.toString(radix)` was rejected because radix formatting needs a separate
policy; boolean/string/bigint `.toString()` and universal object/user-defined
stringification remain separate design work.

## Implementation

- `src/codegen.ts:9119` routes `topaz_number` property calls before
  class/interface fallback.
- `src/codegen.ts:9677` emits only `Number.prototype.toString()` with no
  arguments and lowers it to `topaz_number_to_string(...)`.
- `src/codegen.ts:10461` infers zero-argument `number.toString()` as
  `topaz_string` and rejects arity mismatches.
- `src/codegen.ts:11592` routes call return inference for `topaz_number`
  before class/interface fallback.
- `tests/smoke.sh:221` registers one positive sample and two fail samples.

## Consequences

- **Accepted**: `(0).toString()`, `(-12).toString()`, `(1e21).toString()`,
  expression receivers, string concatenation, `.length`, and the self-host
  shape `fixedTmps.length.toString()` now compile.
- **Rejected**: `n.toString(10)` reports
  `Number.toString expects no arguments`; other number methods such as
  `.toFixed()` still report `unsupported method '.toFixed' on topaz_number`.
- **Regression**: `examples/number_to_string.ts`,
  `examples/number_to_string_arity_fail.ts`, and
  `examples/number_unsupported_method_fail.ts`. `tests/smoke.sh` currently
  registers 346 cases.
- **Current blocker**: none observed in this phase; `pnpm run test:selfhost`
  reaches `PASS [selfhost_fixed_point]`.
