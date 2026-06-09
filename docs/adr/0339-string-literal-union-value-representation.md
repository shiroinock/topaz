# 0339 - string literal union value representation

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.11

## Context

The current self-host probe regressed at `src/cli.ts` on the parameter type
`"break" | "continue"`. This is not an exotic TypeScript shape: string literal
unions are common for tags, state names, option values, and event names. Topaz
already has `string_literal` types for discriminators, but `cTypeName` only
accepted `T | undefined` unions and discriminated class unions, so a plain
literal union had no value representation.

## Decision

Represent a non-optional union whose variants are all string literal types as
`topaz_string`. Matching string literal expressions may initialize, assign,
return, or pass into that union, and equality against string values lowers
through `topaz_string_eq`. Rejected alternatives: adding a general tagged union
representation was rejected as too broad for this self-host blocker; rewriting
`src/cli.ts` to avoid `"break" | "continue"` was rejected because this is a
normal TypeScript idiom; supporting optional literal unions such as
`"a" | undefined` was deferred because it needs sentinel handling separate from
the non-optional string representation.

## Implementation

- `src/codegen.ts:142` adds helpers that recognize string-literal-only unions.
- `src/codegen.ts:221` lets literal unions overlap with plain `string` for
  strict equality type-checking.
- `src/codegen.ts:638` maps string literal unions to `topaz_string` in
  `cTypeName`.
- `src/codegen.ts:8197` emits strict equality on string literal unions with
  `topaz_string_eq`.
- `src/codegen.ts:11603` and `src/codegen.ts:11728` accept matching literal
  expressions at expected-type sites.
- `src/codegen.ts:12093` allows a string literal union value to widen to plain
  `string` without changing its C representation.
- `examples/string_literal_union.ts:1` covers variables, parameters, returns,
  reassignment, and equality for `"break" | "continue"`.
- `tests/smoke.sh:257` and `tests/smoke.sh:339` register positive and mismatch
  regressions.
- `MEMO.md:267` records that current self-host fixed-point restoration remains
  post-MVP work.

## Consequences

- **Accepted**: common string literal union values now use the same runtime
  representation as `string`.
- **Accepted**: the previous self-host blocker
  `topaz_union_string_literal_break_or_string_literal_continue is not T | undefined`
  is cleared.
- **Current blocker**: `pnpm run test:selfhost` now advances to
  `src/builtin_descriptors.ts:334:14`, where a spread class element must flow
  into a dunion array.
- **Rejected**: general non-optional unions and optional string literal unions
  remain out of scope.
- **Regression**: `string_literal_union` and
  `string_literal_union_mismatch_fail` are added to `tests/smoke.sh`.
