# 0211. String.prototype.trimStart (6i prep)

- Status: Accepted
- Date: 2026-06-03
- Phase: 1.5-6i prep

## Context

Phase 177 moved the full-graph self-host probe to `.trimStart()` in
`emitStatement`: `src/codegen.ts:5411:39: unsupported method '.trimStart' on
topaz_string`. Rewriting the compiler source to avoid this would narrow the
TypeScript string surface available to self-hosted source. [ADR 0032](./0032-string-starts-ends-with.md)
and [ADR 0205](./0205-string-repeat.md) already prefer focused standard string
methods when the compiler source naturally depends on them.

## Decision

Accept the zero-argument Topaz subset of
`String.prototype.trimStart(): string` and lower it directly to
`topaz_string_trim_start`. The receiver remains the existing ASCII-only
`topaz_string`, and the runtime trims only the ASCII whitespace bytes common in
source formatting: space, tab, LF, CR, FF, and VT.

Rejected alternatives: rewriting statement-emission call sites was rejected
because it would reduce supported compiler-source coverage. Adding `trim` or
`trimEnd` was rejected because the current blocker needs only leading
whitespace removal. Unicode whitespace and JS coercion were rejected because
Topaz strings are ASCII-only and method arguments remain exact Topaz types.

## Implementation

- `runtime/runtime.h:128-147` adds `topaz_string_trim_start`, scanning leading
  ASCII whitespace bytes and copying the remaining bytes into a fresh arena
  string, with the existing static empty string for empty output.
- `src/codegen.ts:8212-8217` adds emit-side arity validation and lowers
  `.trimStart()` to `topaz_string_trim_start(base)`.
- `src/codegen.ts:8832-8837` mirrors the no-argument validation in
  `inferStringMethodReturn` and returns `T_STRING`.
- `tests/smoke.sh:361-362` wires one positive sample and one compile-fail
  arity sample.

The self-host probe advances past the old `.trimStart()` blocker and now stops
at `src/codegen.ts:5412:11`: `type mismatch: expected topaz_boolean, got
topaz_union_..._or_undefined`.

## Consequences

- **Accepted**: leading ASCII space / tab / LF / CR / FF / VT removal,
  already-trimmed receivers, empty results, chaining, `.length`, concatenation,
  `console.log`, and function-return use.
- **Rejected**: any argument with `String.trimStart expects no arguments`.
- **Regression**: `string_trim_start` and `string_trim_start_arity_fail`;
  `tests/smoke.sh` has 289 checks.
- **Scope out**: `trim`, `trimEnd`, Unicode whitespace, JS ToString coercion,
  and optional arguments.
