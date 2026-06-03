# 0278 - Map and Set method diagnostic and argument cleanup

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0277](./0277-parse-helper-diagnostic-and-argument-cleanup.md) advanced the
self-host probe from the parse helper band into the Map method cluster. The next
blocker was `src/codegen.ts:9256:32`, where the `Map.set` arity diagnostic
passed the full `CallExpr` object to `CodegenError`. The adjacent Map/Set method
lowering code still had the same full-AST diagnostic anchors and post-arity
`expr.args[n]!` reads.

## Decision

Preserve the current Map/Set surface exactly: `Map.set/get/has/delete`,
`Set.add/has/delete`, iterator-returning `values()` / `keys()`, and special
for-of-only `.entries()` keep their existing behavior. Diagnostics in the
emit-side Map/Set method clusters now pass minimal `{ pos: ... }` anchors, and
argument reads use checked locals after arity validation. The arrow expression
body void-call guard for `Map.set` / `Set.add` uses the same checked-local
pattern. Rejected alternatives: adding bare `for-of` over Map was rejected
because Map iteration remains explicit through `.values()` / `.keys()` /
`.entries()`; allowing value-bound `.entries()` was rejected because pair tuple
values are not part of the current subset; making `Map.set` / `Set.add`
chainable was rejected because they remain void in this dialect; class and
interface method diagnostics were left for the next adjacent blocker.

## Implementation

- `src/codegen.ts:4105`: the arrow-body void-call guard for `Map.set` /
  `Set.add` now checks arity with `{ pos: expr.pos }` anchors and stores checked
  argument locals before calling `expectType`.
- `src/codegen.ts:9257`: `emitMapMethodCall` now anchors Map method arity,
  `.entries()`, and unsupported-method diagnostics on `{ pos }` objects and
  emits from checked `keyArg` / `valueArg` locals.
- `src/codegen.ts:9372`: `emitSetMethodCall` applies the same cleanup to
  `Set.add/has/delete`, `values()` / `keys()`, `.entries()`, and unsupported
  Set methods.
- `src/codegen.ts:10224`: value-use rejection for `Map.set` and `Set.add`
  now uses `{ pos: expr.pos }` anchors while preserving the diagnostic strings.

## Consequences

- **Accepted**: existing valid `map_set_basic`, `map_set_class_iface`,
  `for_of_map_values`, and `iterator_basic` behavior is unchanged.
- **Rejected**: wrong Map/Set method arity, wrong key/value/element types,
  value-use of `Map.set` / `Set.add`, value-bound `.entries()`, and unsupported
  Map/Set methods remain rejected.
- **Regression**: no new examples were added because behavior is unchanged and
  the existing Map/Set and iterator smoke cases cover this surface.
  `tests/smoke.sh` has 280 primary compile/run/fail entries, or 296 `run_*`
  entries including warning-free variants.
- **Self-host**: the old `src/codegen.ts:9256:32` blocker is removed. The next
  probe blocker is `src/codegen.ts:9325:10`, in the class/interface method
  diagnostic band that this phase deliberately leaves out of scope.
