# 0272 - array method diagnostic and argument cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0271](./0271-contextual-iife-expected-params-loop.md) advanced the self-host
probe into `emitArrayMethodCall`. The next blocker was
`src/codegen.ts:8232:32`, where an Array method arity diagnostic passed the
full `CallExpr` object to `CodegenError` and forced incompatible anonymous
object shapes through the self-host subset. The same Array method cluster also
still read checked arguments through `expr.args[n]!` after arity validation.

## Decision

Preserve the existing Array method surface and batch the cleanup inside the
Array emit and infer branches. Diagnostics now pass stable `{ pos: ... }`
anchors for arity, callback, separator, and unsupported-method errors, and
post-arity arguments are copied into local bindings before use. Rejected
alternatives: adding Array method features was rejected because this phase is a
self-hostability cleanup; adding a broad optional-index helper was rejected
because the current `tsc` type for `expr.args[n]` is already `Expr`; removing
diagnostics was rejected because unsupported forms must still fail with
file/line/col.

## Implementation

- `src/codegen.ts:8230`: `emitArrayMethodCall` now anchors Array method arity
  diagnostics on `{ pos: expr.pos }` instead of passing the full `CallExpr`.
- `src/codegen.ts:8234`: `push`, `map`, `includes`, `filter`, `slice`, and
  `join` copy arity-checked arguments into local bindings before emitting.
- `src/codegen.ts:8438`: `arrayIncludesEqExpr` accepts a minimal diagnostic
  anchor instead of a full `CallExpr`.
- `src/codegen.ts:8465`: `emitArrayJoinSeparator` now receives the checked
  separator expression, leaving default separator handling at the call site.
- `src/codegen.ts:10038`: the infer-side Array method branch mirrors the same
  `{ pos }` diagnostics and checked local argument pattern.

## Consequences

- **Accepted**: existing valid `push`, `pop`, `map`, `slice`, `includes`,
  `filter`, and `join` behavior is unchanged.
- **Rejected**: `Array.map` extra callback parameters, `includes(fromIndex)`,
  non-scalar `join`, and unsupported `map` result element types remain
  unsupported.
- **Regression**: no new examples were added because behavior is unchanged;
  existing cases such as `array_method_map`,
  `array_map_callback_arity_fail`, `array_includes_from_index_fail`,
  `array_slice_arg_type_fail`, and `array_join_sep_type_fail` cover the
  boundaries. `tests/smoke.sh` has 277 `run_*` entries.
- **Self-host**: the old `src/codegen.ts:8232:32` blocker is removed. The next
  probe blocker is `src/codegen.ts:8489:32` in the String method cluster.
- **Scope out**: String method diagnostics and broader call-argument cleanup
  remain outside this phase.
