# 0273 - string method diagnostic and argument cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0272](./0272-array-method-diagnostic-and-argument-cleanup.md) advanced the
self-host probe from Array method diagnostics into the String method cluster.
The next blocker was `src/codegen.ts:8489:32`, where
`String.charCodeAt` arity diagnostics passed the full `CallExpr` object to
`CodegenError`. The same cluster still had several post-arity
`expr.args[n]!` reads in instance String methods, `String.fromCharCode`, and
the infer-side String helper.

## Decision

Preserve the current supported and rejected String method surface. Diagnostics
in the String method cluster now use minimal `{ pos: ... }` anchors, and
checked arguments are copied into local bindings before type inference or
emission. Rejected alternatives: adding JS coercions or optional overloads was
rejected because this phase only addresses self-host subset shape issues;
adding `startsWith(search, position)` / `endsWith(search, length)` was rejected
because those contracts are outside the existing Topaz subset; removing
diagnostics was rejected because unsupported forms must still fail with
file/line/col.

## Implementation

- `src/codegen.ts:8481`: `emitStringMethodCall` now anchors arity, argument
  type, and unsupported-method diagnostics on `{ pos: expr.pos }`,
  `{ pos: arg.pos }`, or `{ pos: callee.pos }`.
- `src/codegen.ts:8491`: `charCodeAt`, `slice`, `repeat`, `startsWith`, and
  `endsWith` copy arity-checked arguments into local variables before
  `inferType` and `emitWithExpected`.
- `src/codegen.ts:8569`: `emitStringStaticCall` applies the same checked
  argument local and `{ pos }` diagnostic pattern to `String.fromCharCode`.
- `src/codegen.ts:8595`: `inferStringStaticReturn` mirrors the static
  `String.fromCharCode` checks without passing full AST objects to
  `CodegenError`.
- `src/codegen.ts:9115`: `inferStringMethodReturn` mirrors the instance method
  cleanup so emit-side and infer-side diagnostics stay aligned.

## Consequences

- **Accepted**: existing valid `charCodeAt`, `slice`, `repeat`, `trimStart`,
  `startsWith`, `endsWith`, and `String.fromCharCode` behavior is unchanged.
- **Rejected**: wrong arity, non-number numeric arguments, non-string search
  arguments, too many `slice` arguments, and unknown String methods remain
  rejected.
- **Regression**: no new examples were added because behavior is unchanged;
  existing smoke cases around `string_method`, `string_char_code_at_*`,
  `string_slice_*`, `string_repeat_*`, `string_trim_start_*`,
  `string_starts_with_*`, `string_ends_with_*`, `string_from_char_code_*`, and
  `string_static_unknown_fail` cover the boundaries. `tests/smoke.sh` has 281
  `run_*` entries.
- **Self-host**: the old `src/codegen.ts:8489:32` blocker is removed; any later
  probe blocker is outside this String method cleanup phase.
