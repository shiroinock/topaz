# 0205. String.prototype.repeat (6i prep)

- Status: Accepted
- Date: 2026-06-03
- Phase: 1.5-6i prep

## Context

Phase 171 moved the full-graph self-host probe to `.repeat` on a string literal
inside `emitBlock`: `src/codegen.ts:5096:17: unsupported method '.repeat' on
topaz_string`. Rewriting the compiler source away from `"  ".repeat(indent)`
would shrink the TypeScript surface just to dodge a blocker. [ADR 0032](./0032-string-starts-ends-with.md)
already chose to add focused string methods when loader/codegen needed
standard string operations, so `repeat` follows that pattern.

## Decision

Accept the one-argument Topaz subset of `String.prototype.repeat(count:
number): string` and lower it directly to `topaz_string_repeat`. The receiver
remains the existing ASCII-only `topaz_string`; the count is a `number` with no
JS coercion or optional arguments. Runtime invalid counts and implausibly large
outputs abort with a `topaz:` diagnostic instead of introducing built-in
`RangeError` semantics.

Rejected alternatives: rewriting compiler call sites to loops was rejected
because it would reduce supported source coverage. Full ECMAScript repeat
semantics were rejected because Topaz does not yet model built-in range
exceptions. Letting arena allocation failure be the only guard was rejected
because repeat can multiply a small receiver into unbounded output.

## Implementation

- `runtime/runtime.h:128-161` adds `TOPAZ_STRING_REPEAT_MAX_BYTES` and
  `topaz_string_repeat`, rejecting non-finite / negative counts, truncating
  positive fractions with `floor`, guarding overflow / 256 MiB output, and
  copying bytes into a fresh arena string.
- `src/codegen.ts:8104-8120` adds emit-side arity/type validation and lowers
  `.repeat(count)` to `topaz_string_repeat(base, count)`.
- `src/codegen.ts:8719-8734` mirrors the same validation in
  `inferStringMethodReturn` and returns `T_STRING`.
- `tests/smoke.sh:358-360` wires one positive sample and two compile-fail
  samples.

The self-host probe now advances past the old `.repeat` blocker and stops at
`src/codegen.ts:5114:23`: `type mismatch: expected topaz_boolean, got
topaz_union_..._or_undefined`.

## Consequences

- **Accepted**: `"x".repeat(3)`, `"x".repeat(0)`, receiver expressions such as
  `"ab".slice(0, 1).repeat(2)`, string concatenation, `.length`, and positive
  fractional counts truncated by the runtime.
- **Rejected**: arity != 1 with `String.repeat expects exactly one argument`;
  non-number counts with `String.repeat argument must be number, got ...`;
  non-finite / negative / huge runtime counts abort.
- **Regression**: `string_repeat`, `string_repeat_arity_fail`, and
  `string_repeat_arg_type_fail`; `tests/smoke.sh` has 287 checks.
- **Scope out**: JS coercion, optional arguments, Unicode-aware character
  semantics, and built-in `RangeError`.
